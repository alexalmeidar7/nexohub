import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const esc = (s: string) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

async function withRetry<T>(fn: () => PromiseLike<{ data: T; error: any }>, tries = 3): Promise<T> {
  let lastErr: any;
  for (let i = 0; i < tries; i++) {
    try {
      const { data, error } = await Promise.race([
        fn(),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("db timeout")), 6000)),
      ]);
      if (!error) return data;
      lastErr = error;
    } catch (e) { lastErr = e; }
    if (i < tries - 1) await new Promise((r) => setTimeout(r, 300 * (i + 1)));
  }
  throw lastErr;
}

const xmlHeaders = {
  ...corsHeaders,
  "Content-Type": "application/xml; charset=utf-8",
  "Cache-Control": "no-store, no-cache, must-revalidate",
  "CDN-Cache-Control": "no-store",
};

Deno.serve(async (req) => {
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
    const subUser: any = await withRetry(() => sb.from("sub_users")
      .select("parent_user_id, ativo").eq("auth_user_id", userId).maybeSingle());
    const ownerId = subUser?.ativo && subUser.parent_user_id ? subUser.parent_user_id : userId;

    // Cada feed consulta exclusivamente os roteiros da estação solicitada.
    const allUserRoteiros: any[] = (await withRetry(() => sb
      .from("roteiros")
      .select("programa_nome, estudio, data_programa, horario, participantes, subtitulo, xml_pushed_at, created_at, updated_at")
      .eq("user_id", ownerId)
      .order("updated_at", { ascending: false })
      .limit(200))) || [];

    const norm = (s: string) =>
      String(s || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .trim();

    const targetEst = norm(estudio);
    const nowLocal = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const todayLocal = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, "0")}-${String(nowLocal.getDate()).padStart(2, "0")}`;
    let candidates = (allUserRoteiros || []).filter((r: any) => {
      const rEst = norm(r.estudio);
      const rDate = String(r.data_programa || "").slice(0, 10);
      return rEst === targetEst && rDate === todayLocal;
    });

    // Carrega horarios dos programas para fallback
    let progs: any[] = [];
    try {
      progs = (await withRetry(() => sb.from("programas").select("nome, horario_inicio").eq("user_id", ownerId), 2)) || [];
    } catch (e) { console.warn("[serve-xml-roteiro-estudio] programas fallback:", String(e)); }
    const progMap = new Map<string, string>();
    (progs || []).forEach((p: any) => { if (p.nome) progMap.set(p.nome, (p.horario_inicio || "").slice(0, 5)); });

    // Entre os roteiros do dia e estúdio exatos, prevalece a edição mais recente.
    candidates.sort((a: any, b: any) => {
      const tsA = new Date(a.updated_at || a.created_at || 0).getTime();
      const tsB = new Date(b.updated_at || b.created_at || 0).getTime();
      return tsB - tsA;
    });

    const r = candidates[0] || null;

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

      const finalHora = r.horario || progMap.get(r.programa_nome) || "00:00";
      xml += `  <programa>${esc(r.programa_nome || "")}</programa>\n`;
      xml += `  <estudio>${esc(r.estudio || "")}</estudio>\n`;
      xml += `  <data>${esc(r.data_programa || new Date().toISOString().split("T")[0])}</data>\n`;
      xml += `  <atualizado_em>${esc(r.updated_at || r.created_at || "")}</atualizado_em>\n`;
      xml += `  <horario>${esc(finalHora)}</horario>\n`;
      xml += `  <hora>${esc(finalHora)}</hora>\n`;

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
       xml += `    <subtituloTarja>${esc(podcastData.subtituloTarja || "")}</subtituloTarja>\n`;
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
          // Rotate active image every 10 seconds
          const idx = Math.floor(Date.now() / 10000) % imagens.length;
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
    return new Response(xml, { status: 200, headers: { ...xmlHeaders, "Vary": "user_id, estudio" } });
  } catch (err) {
    console.error("[serve-xml-roteiro-estudio] database failure:", String(err));
    const body = `<?xml version="1.0" encoding="UTF-8"?>\n<programaExpress>\n  <indisponivel>true</indisponivel>\n  <erro>dados temporariamente indisponiveis</erro>\n</programaExpress>`;
    return new Response(body, {
      status: 503,
      headers: { ...xmlHeaders, "X-Data-Stale": "0", "Retry-After": "15" },
    });
  }
});
