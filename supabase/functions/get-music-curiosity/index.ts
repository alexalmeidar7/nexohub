import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const fastSupabaseFetch: typeof fetch = (input, init = {}) =>
  fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(8000) });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { artista, musica, userId: requestedUserId, deezerArtistImg } = await req.json();
    if (
      typeof artista !== "string" || typeof musica !== "string" ||
      !artista.trim() || !musica.trim()
    ) {
      // Sem dados suficientes: não é erro, apenas nada a gerar
      return new Response(
        JSON.stringify({ ok: false, curiosidade: "", skipped: true, reason: "missing_track_info" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Identify the calling user from JWT
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization") || "";
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader }, fetch: fastSupabaseFetch },
      auth: { persistSession: false, autoRefreshToken: false },
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

    const supabase = createClient(supabaseUrl, serviceRoleKey, { global: { fetch: fastSupabaseFetch }, auth: { persistSession: false, autoRefreshToken: false } });
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

    // 0) Verifica exceções e flag de IA habilitada + Cota Mensal
    const { data: settings } = await supabase
      .from("user_settings")
      .select("infomusic_excecoes, infomusic_ai_enabled, infomusic_ai_monthly_count, infomusic_ai_last_reset")
      .eq("user_id", userId)
      .maybeSingle();

    const aiEnabled = settings?.infomusic_ai_enabled !== false;
    const excecoesRaw = (settings?.infomusic_excecoes || "") as string;
    const excecoes = excecoesRaw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter((s) => s.length > 0);

    // Filtro fixo de sistema
    const systemExceptions = ["break"];
    const allExceptions = [...excecoes, ...systemExceptions];

    if (allExceptions.length > 0) {
      const artistaLower = artistaTrim.toLowerCase();
      const musicaLower = musicaTrim.toLowerCase();
      const matched = allExceptions.some(
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

    // 1.5) Verifica cota mensal e flag IA habilitada
    if (!aiEnabled) {
      return new Response(
        JSON.stringify({ curiosidade: "", skipped: true, reason: "ai_disabled" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Lógica de reset mensal da cota
    const now = new Date();
    const lastReset = settings?.infomusic_ai_last_reset ? new Date(settings.infomusic_ai_last_reset) : now;
    const isNewMonth = now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear();
    
    let currentMonthlyCount = isNewMonth ? 0 : (settings?.infomusic_ai_monthly_count || 0);
    
    if (currentMonthlyCount >= 20) {
      return new Response(
        JSON.stringify({ curiosidade: "", skipped: true, reason: "monthly_quota_exceeded" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Se mudou o mês, já reseta no banco para garantir
    if (isNewMonth) {
      await supabase
        .from("user_settings")
        .update({ infomusic_ai_monthly_count: 0, infomusic_ai_last_reset: now.toISOString() })
        .eq("user_id", userId);
    }

    // 2) Generate via Lovable AI
    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not configured");

    const aiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model: "gpt-4o",
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
        return new Response(
          JSON.stringify({ ok: false, curiosidade: "", skipped: true, reason: "ai_credits_exhausted" }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
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

    // 3) Save to global cache (6 months expiration) + Increment User Quota
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 6);

    // Increment count in DB
    await supabase
      .from("user_settings")
      .update({ infomusic_ai_monthly_count: currentMonthlyCount + 1 })
      .eq("user_id", userId);

    await supabase
      .from("infomusic")
      .insert({ 
        user_id: userId, 
        artista: artistaTrim, 
        musica: musicaTrim, 
        curiosidade,
        deezer_artist_img: deezerArtistImg || null,
        expires_at: expiresAt.toISOString()
      })
      .select()
      .maybeSingle();

    return new Response(JSON.stringify({ curiosidade, cached: false, quota_used: currentMonthlyCount + 1 }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const error = e as Error;
    const timedOut = error?.name === "TimeoutError" || error?.name === "AbortError";
    console.warn("get-music-curiosity skipped:", error?.message || e);
    return new Response(JSON.stringify({ ok: false, curiosidade: "", skipped: true, reason: timedOut ? "timeout" : "temporarily_unavailable" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
});
