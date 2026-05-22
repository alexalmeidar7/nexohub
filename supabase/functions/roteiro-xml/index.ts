import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function esc(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const roteiroId = url.searchParams.get("id");

    if (!roteiroId) {
      return new Response("<error>id parameter is required</error>", {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Fetch roteiro
    const { data: roteiro, error } = await supabase
      .from("roteiros")
      .select("titulo, subtitulo, participantes, programa_nome, user_id, estudio")
      .eq("id", roteiroId)
      .maybeSingle();

    if (error || !roteiro) {
      return new Response("<error>Roteiro not found</error>", {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
      });
    }

    // Fetch program logo + empresa config in parallel
    const [programaRes, empresaRes] = await Promise.all([
      supabase
        .from("programas")
        .select("capa, selo, nome")
        .eq("user_id", roteiro.user_id)
        .eq("nome", roteiro.programa_nome)
        .maybeSingle(),
      supabase
        .from("empresa_config")
        .select("telefone_participacao")
        .eq("user_id", roteiro.user_id)
        .maybeSingle(),
    ]);

    const programa = programaRes.data;
    const empresa = empresaRes.data;

    // Parse participantes
    let participantes: { nome: string; categoria?: string; cargo?: string; instagram?: string; whatsapp?: string }[] = [];
    let apoioImagens: string[] = [];
    let apoioVideos: string[] = [];
    let podcastData: any = null;
    try {
      const raw = typeof roteiro.participantes === "string"
        ? JSON.parse(roteiro.participantes)
        : roteiro.participantes || {};

      if (Array.isArray(raw)) {
        participantes = raw;
      } else {
        participantes = raw.participantes || [];
        if (raw.podcastData) {
          podcastData = raw.podcastData;
          apoioImagens = (raw.podcastData.apoioImagens || []).filter((u: string) => u && u.trim());
          apoioVideos = (raw.podcastData.apoioVideos || []).filter((u: string) => u && u.trim());
        }
      }
    } catch {
      participantes = [];
    }

    // Check podcast scheduling: if scheduled and not yet released, hide content
    let scheduledHidden = false;
    if (podcastData?.agendamentoData && podcastData?.agendamentoHorario) {
      // Build a Date in São Paulo time (UTC-3) and compare to now
      const releaseAt = new Date(`${podcastData.agendamentoData}T${podcastData.agendamentoHorario}:00-03:00`);
      if (!isNaN(releaseAt.getTime()) && Date.now() < releaseAt.getTime()) {
        scheduledHidden = true;
      }
    }

    if (scheduledHidden) {
      participantes = [];
      apoioImagens = [];
      apoioVideos = [];
    }

    const logoUrl = programa?.selo || programa?.capa || "";
    const whatsappNum = empresa?.telefone_participacao || "";
    const qrcodeLink = whatsappNum && !scheduledHidden
      ? `https://wa.me/${whatsappNum.replace(/\D/g, "")}`
      : "";

    const tituloOut = scheduledHidden ? "" : (roteiro.titulo || "");
    const subtituloOut = scheduledHidden ? "" : (roteiro.subtitulo || "");

    // Build flat/tabular XML for vMix Data Sources
    // Each participant becomes a <dados> row with all fields as flat columns
    // Rotate active apoio image every 10 seconds
    const apoioValid = apoioImagens.filter((u) => u && u.trim());
    const imagemApoioAtual = apoioValid.length > 0
      ? apoioValid[Math.floor(Date.now() / 10000) % apoioValid.length]
      : "";

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<items>\n`;

    if (participantes.length === 0) {
      // Single row with general data
      xml += `  <dados>\n`;
      xml += `    <titulo>${esc(tituloOut)}</titulo>\n`;
      xml += `    <subtitulo>${esc(subtituloOut)}</subtitulo>\n`;
      xml += `    <programa>${esc(roteiro.programa_nome || "")}</programa>\n`;
      xml += `    <logo_url>${esc(logoUrl)}</logo_url>\n`;
      xml += `    <participante_nome></participante_nome>\n`;
      xml += `    <participante_cargo></participante_cargo>\n`;
      xml += `    <rede_social_instagram_texto></rede_social_instagram_texto>\n`;
      xml += `    <rede_social_whatsapp_texto>${esc(whatsappNum)}</rede_social_whatsapp_texto>\n`;
      xml += `    <qrcode_link>${esc(qrcodeLink)}</qrcode_link>\n`;
      xml += `    <imagem_apoio_atual>${esc(imagemApoioAtual)}</imagem_apoio_atual>\n`;
      for (let i = 0; i < 5; i++) {
        xml += `    <imagem_apoio_${i + 1}>${esc(apoioImagens[i] || "")}</imagem_apoio_${i + 1}>\n`;
      }
      for (let i = 0; i < 5; i++) {
        xml += `    <video_apoio_${i + 1}>${esc(apoioVideos[i] || "")}</video_apoio_${i + 1}>\n`;
      }
      xml += `  </dados>\n`;
    } else {
      for (let idx = 0; idx < participantes.length; idx++) {
        const p = participantes[idx];
        xml += `  <dados>\n`;
        xml += `    <titulo>${esc(tituloOut)}</titulo>\n`;
        xml += `    <subtitulo>${esc(subtituloOut)}</subtitulo>\n`;
        xml += `    <programa>${esc(roteiro.programa_nome || "")}</programa>\n`;
        xml += `    <logo_url>${esc(logoUrl)}</logo_url>\n`;
        xml += `    <participante_nome>${esc(p.nome || "")}</participante_nome>\n`;
        xml += `    <participante_cargo>${esc(p.cargo || p.categoria || "")}</participante_cargo>\n`;
        xml += `    <rede_social_instagram_texto>${esc(p.instagram || "")}</rede_social_instagram_texto>\n`;
        xml += `    <rede_social_whatsapp_texto>${esc(p.whatsapp || whatsappNum)}</rede_social_whatsapp_texto>\n`;
        xml += `    <qrcode_link>${esc(qrcodeLink)}</qrcode_link>\n`;
        xml += `    <imagem_apoio_atual>${esc(imagemApoioAtual)}</imagem_apoio_atual>\n`;
        for (let i = 0; i < 5; i++) {
          xml += `    <imagem_apoio_${i + 1}>${esc(apoioImagens[i] || "")}</imagem_apoio_${i + 1}>\n`;
        }
        for (let i = 0; i < 5; i++) {
          xml += `    <video_apoio_${i + 1}>${esc(apoioVideos[i] || "")}</video_apoio_${i + 1}>\n`;
        }
        xml += `  </dados>\n`;
      }
    }

    xml += `</items>`;

    return new Response(xml, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3",
      },
    });
  } catch (err) {
    return new Response(`<error>${String(err)}</error>`, {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
    });
  }
});
