import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");
    const estudio = url.searchParams.get("estudio");

    if (!userId || !estudio) {
      return new Response("<error>user_id and estudio required</error>", {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
      });
    }

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Most recent express roteiro for this studio
    const { data: r } = await sb
      .from("roteiros")
      .select("programa_nome, estudio, data_programa, participantes, subtitulo")
      .eq("user_id", userId)
      .ilike("estudio", estudio)
      .like("subtitulo", "express_xml::%")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n<programaExpress>\n`;

    if (r) {
      let parts: any = {};
      try {
        let raw: any = r.participantes;
        if (typeof raw === "string") raw = JSON.parse(raw);
        if (typeof raw === "string") raw = JSON.parse(raw);
        parts = Array.isArray(raw) ? { blocos: [], participantes: raw } : (raw || {});
      } catch { parts = {}; }

      const pList: any[] = parts.participantes || [];
      const blocosList: any[] = parts.blocos || [];
      const escaladaItems: any[] = parts.escaladaList || [];
      const podcastData = parts.podcastData;
      const isPodcast = !!podcastData;

      xml += `  <programa>${esc(r.programa_nome || "")}</programa>\n`;
      xml += `  <estudio>${esc(r.estudio || "")}</estudio>\n`;
      xml += `  <data>${r.data_programa || new Date().toISOString().split("T")[0]}</data>\n`;

      if (pList.length > 0) {
        xml += `  <participantes>\n`;
        pList.forEach((p: any) => {
          xml += `    <item>\n      <nome>${esc(p.nome || "")}</nome>\n      <cargo>${esc(p.cargo || "")}</cargo>\n      <instagram>${esc(p.instagram || "")}</instagram>\n    </item>\n`;
        });
        xml += `  </participantes>\n`;
      }

      if (isPodcast) {
        xml += `  <roteiro>\n`;
        xml += `    <tituloTarja>${esc(podcastData.tituloTarja || "")}</tituloTarja>\n`;
        xml += `    <introducao>${esc(podcastData.introducao || "")}</introducao>\n`;
        xml += `    <perguntas>\n`;
        (podcastData.perguntas || []).filter((p: string) => p && p.trim()).forEach((p: string, i: number) => {
          xml += `      <pergunta ordem="${i + 1}">${esc(p)}</pergunta>\n`;
        });
        xml += `    </perguntas>\n`;
        xml += `    <concluindo>${esc(podcastData.concluindo || "")}</concluindo>\n`;

        const imagens: string[] = (podcastData.apoioImagens || []).filter((u: string) => u && u.trim());
        const videos: string[] = (podcastData.apoioVideos || []).filter((u: string) => u && u.trim());
        if (imagens.length > 0) {
          // Rotate active image every 5 seconds
          const idx = Math.floor(Date.now() / 5000) % imagens.length;
          xml += `    <imagemAtual>${esc(imagens[idx])}</imagemAtual>\n`;
          xml += `    <apoioImagens>\n`;
          imagens.forEach((u) => { xml += `      <imagem>${esc(u)}</imagem>\n`; });
          xml += `    </apoioImagens>\n`;
        }
        if (videos.length > 0) {
          xml += `    <apoioVideos>\n`;
          videos.forEach((u) => { xml += `      <video>${esc(u)}</video>\n`; });
          xml += `    </apoioVideos>\n`;
        }
        xml += `  </roteiro>\n`;
      } else {
        if (escaladaItems.length > 0) {
          xml += `  <escalada>\n`;
          escaladaItems.forEach((e: any, i: number) => {
            xml += `    <item ordem="${i + 1}">\n      <titulo>${esc(typeof e === "string" ? e : e.titulo || "")}</titulo>\n      <imagem>${esc(typeof e === "string" ? "" : e.imagemUrl || "")}</imagem>\n    </item>\n`;
          });
          xml += `  </escalada>\n`;
        }
        blocosList.forEach((b: any, bi: number) => {
          xml += `  <bloco numero="${bi + 1}">\n`;
          (b.noticias || []).forEach((n: any, ni: number) => {
            if (!n.titulo) return;
            xml += `    <noticia ordem="${ni + 1}">\n      <titulo>${esc(n.titulo)}</titulo>\n      <imagem>${esc(n.imagemUrl || "")}</imagem>\n      <escalada>${n.escalada ? "true" : "false"}</escalada>\n    </noticia>\n`;
          });
          xml += `  </bloco>\n`;
        });
      }
    } else {
      xml += `  <estudio>${esc(estudio)}</estudio>\n`;
    }

    xml += `</programaExpress>`;

    return new Response(xml, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=10",
      },
    });
  } catch (err) {
    return new Response(`<error>${String(err)}</error>`, {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" },
    });
  }
});
