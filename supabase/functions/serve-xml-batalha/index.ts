import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Check for a scheduled battle matching now
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const currentTime = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Sao_Paulo" });

    const { data: scheduled } = await sb
      .from("batalhas_agendadas")
      .select("*")
      .eq("user_id", userId)
      .eq("data_batalha", today)
      .lte("horario_inicio", currentTime)
      .gte("horario_fim", currentTime)
      .order("horario_inicio", { ascending: false })
      .limit(1)
      .maybeSingle();

    let nome1 = "", musica1 = "", pct1 = 0, img1 = "";
    let nome2 = "", musica2 = "", pct2 = 0, img2 = "";

    if (scheduled) {
      nome1 = scheduled.artista1_nome ?? "";
      musica1 = scheduled.artista1_musica ?? "";
      pct1 = scheduled.artista1_porcentagem ?? 0;
      img1 = scheduled.artista1_imagem ?? "";
      nome2 = scheduled.artista2_nome ?? "";
      musica2 = scheduled.artista2_musica ?? "";
      pct2 = scheduled.artista2_porcentagem ?? 0;
      img2 = scheduled.artista2_imagem ?? "";
    }
    // No fallback — XML only serves data from scheduled battles

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <batalha>
    <artista1_nome>${esc(nome1)}</artista1_nome>
    <artista1_musica>${esc(musica1)}</artista1_musica>
    <artista1_porcentagem>${pct1}%</artista1_porcentagem>
    <artista1_imagem>${esc(img1)}</artista1_imagem>
    <artista2_nome>${esc(nome2)}</artista2_nome>
    <artista2_musica>${esc(musica2)}</artista2_musica>
    <artista2_porcentagem>${pct2}%</artista2_porcentagem>
    <artista2_imagem>${esc(img2)}</artista2_imagem>
  </batalha>
</items>`;

    return new Response(xml, {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0, s-maxage=0, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        "Surrogate-Control": "no-store",
        "CDN-Cache-Control": "no-store",
        "Vary": "*",
        "Last-Modified": new Date().toUTCString(),
        "ETag": `"${Date.now()}"`,
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
