import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { artista, musica, userId: requestedUserId } = await req.json();
    if (!artista || !musica || typeof artista !== "string" || typeof musica !== "string") {
      return new Response(JSON.stringify({ error: "artista e musica são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Identify the calling user from JWT
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      // Return 200 with skip flag to avoid breaking the UI when session expired
      return new Response(
        JSON.stringify({ ok: false, curiosidade: "", skipped: true, reason: "not_authenticated" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const authUserId = userData.user.id;

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    let userId = authUserId;
    if (typeof requestedUserId === "string" && requestedUserId && requestedUserId !== authUserId) {
      const { data: subUser } = await supabase
        .from("sub_users")
        .select("id")
        .eq("auth_user_id", authUserId)
        .eq("parent_user_id", requestedUserId)
        .eq("ativo", true)
        .maybeSingle();

      if (!subUser) {
        return new Response(JSON.stringify({ error: "Usuário sem permissão para estas curiosidades" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      userId = requestedUserId;
    }

    const artistaTrim = artista.trim();
    const musicaTrim = musica.trim();

    // 0) Verifica exceções e flag de IA habilitada
    const { data: settings } = await supabase
      .from("user_settings")
      .select("infomusic_excecoes, infomusic_ai_enabled")
      .eq("user_id", userId)
      .maybeSingle();

    const aiEnabled = settings?.infomusic_ai_enabled !== false;
    const excecoesRaw = (settings?.infomusic_excecoes || "") as string;
    const excecoes = excecoesRaw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);

    if (excecoes.length > 0) {
      const artistaLower = artistaTrim.toLowerCase();
      const musicaLower = musicaTrim.toLowerCase();
      const matched = excecoes.some(
        (palavra) => artistaLower.includes(palavra) || musicaLower.includes(palavra),
      );
      if (matched) {
        return new Response(
          JSON.stringify({ curiosidade: "", skipped: true, reason: "excecao" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // 1) Global cache lookup (check if anyone has this music/artist curiosity)
    const { data: cached } = await supabase
      .from("infomusic")
      .select("curiosidade")
      .ilike("artista", artistaTrim)
      .ilike("musica", musicaTrim)
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();

    if (cached?.curiosidade) {
      return new Response(JSON.stringify({ curiosidade: cached.curiosidade, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Optional: cleanup expired records periodically (e.g. 5% of requests)
    if (Math.random() < 0.05) {
      void supabase
        .from("infomusic")
        .delete()
        .lt("expires_at", new Date().toISOString())
        .then(() => {});
    }

    // 1.5) Se IA está desabilitada, retorna vazio sem gerar
    if (!aiEnabled) {
      return new Response(
        JSON.stringify({ curiosidade: "", skipped: true, reason: "ai_disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2) Generate via Lovable AI
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          {
            role: "system",
            content:
              "Você é um locutor de rádio brasileiro. Responda em português, em UMA única frase curta (no máximo 15 palavras), apenas com uma curiosidade real, factual e interessante sobre a música ou o artista. Sem introduções, sem títulos, sem aspas, sem emojis. Seja direto e objetivo. Se não souber algo factual, fale algo curto e genérico sobre a carreira do artista.",
          },
          {
            role: "user",
            content: `Curiosidade sobre a música "${musicaTrim}" do artista "${artistaTrim}".`,
          },
        ],
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit excedido" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos esgotados no Lovable AI" }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("AI error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "Falha ao gerar curiosidade" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const curiosidade: string = (aiData?.choices?.[0]?.message?.content || "").trim();

    if (!curiosidade) {
      return new Response(JSON.stringify({ error: "Resposta vazia da IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3) Save to global cache (6 months expiration)
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 6);

    await supabase
      .from("infomusic")
      .insert({ 
        user_id: userId, 
        artista: artistaTrim, 
        musica: musicaTrim, 
        curiosidade,
        expires_at: expiresAt.toISOString()
      })
      .select()
      .maybeSingle();

    return new Response(JSON.stringify({ curiosidade, cached: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("get-music-curiosity error", e);
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
