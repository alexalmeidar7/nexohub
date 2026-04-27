import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { artista, musica } = await req.json();
    if (!artista || !musica || typeof artista !== "string" || typeof musica !== "string") {
      return new Response(JSON.stringify({ error: "artista e musica são obrigatórios" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const artistaTrim = artista.trim();
    const musicaTrim = musica.trim();

    // 1) Cache lookup (cleanup expired first)
    await supabase.from("infomusic").delete().lt("expires_at", new Date().toISOString());

    const { data: cached } = await supabase
      .from("infomusic")
      .select("curiosidade")
      .ilike("artista", artistaTrim)
      .ilike("musica", musicaTrim)
      .maybeSingle();

    if (cached?.curiosidade) {
      return new Response(JSON.stringify({ curiosidade: cached.curiosidade, cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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
              "Você é um locutor de rádio brasileiro. Responda em português, em no máximo 2 frases curtas (cerca de 20 a 30 palavras), apenas com uma curiosidade real, factual e interessante sobre a música ou o artista informado. Sem introduções, sem títulos, sem aspas, sem emojis. Seja direto e objetivo. Se não souber algo factual, fale algo curto e genérico sobre a carreira do artista.",
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

    // 3) Save to cache (ignore conflict)
    await supabase
      .from("infomusic")
      .insert({ artista: artistaTrim, musica: musicaTrim, curiosidade })
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
