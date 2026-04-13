import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LEGACY_UNTOUCHED_PERCENTAGE = 50;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");

    if (!userId) {
      return new Response("<error>user_id required</error>", {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    const { data, error } = await sb
      .from("user_settings")
      .select("cenario_config")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("DB error:", error);
      return new Response("<error>db error</error>", {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
      });
    }

    const config = data?.cenario_config as Record<string, unknown> | null;
    const battle = config?.batalha_musical as Record<string, unknown> | null;

    const a1 = (battle?.artista1 ?? {}) as Record<string, unknown>;
    const a2 = (battle?.artista2 ?? {}) as Record<string, unknown>;
    const rawPct1 = typeof a1.porcentagem === "number" ? a1.porcentagem : 0;
    const rawPct2 = typeof a2.porcentagem === "number" ? a2.porcentagem : 0;
    const isLegacyUntouchedState =
      battle?.percentagesTouched !== true &&
      rawPct1 === LEGACY_UNTOUCHED_PERCENTAGE &&
      rawPct2 === LEGACY_UNTOUCHED_PERCENTAGE;

    const nome1 = typeof a1.nome === "string" ? a1.nome : "";
    const musica1 = typeof a1.musica === "string" ? a1.musica : "";
    const pct1 = isLegacyUntouchedState ? 0 : rawPct1;
    const img1 = typeof a1.imagemUrl === "string" ? a1.imagemUrl : "";

    const nome2 = typeof a2.nome === "string" ? a2.nome : "";
    const musica2 = typeof a2.musica === "string" ? a2.musica : "";
    const pct2 = isLegacyUntouchedState ? 0 : rawPct2;
    const img2 = typeof a2.imagemUrl === "string" ? a2.imagemUrl : "";

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <batalha>
    <artista1_nome>${esc(nome1)}</artista1_nome>
    <artista1_musica>${esc(musica1)}</artista1_musica>
    <artista1_porcentagem>${pct1}</artista1_porcentagem>
    <artista1_imagem>${esc(img1)}</artista1_imagem>
    <artista2_nome>${esc(nome2)}</artista2_nome>
    <artista2_musica>${esc(musica2)}</artista2_musica>
    <artista2_porcentagem>${pct2}</artista2_porcentagem>
    <artista2_imagem>${esc(img2)}</artista2_imagem>
  </batalha>
</items>`;

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    });
  } catch (err) {
    console.error("Error:", err);
    return new Response("<error>internal error</error>", {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
    });
  }
});
