import { createClient } from "npm:@supabase/supabase-js@2";
const serve = Deno.serve;
import { ensureVmixPngUrl } from "../_shared/vmixPng.ts";
import { noticiasComCampoFixo } from "../_shared/roteiroNoticias.ts";

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

const fastSupabaseFetch: typeof fetch = (input, init = {}) =>
  fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(8000) });

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

    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { global: { fetch: fastSupabaseFetch }, auth: { persistSession: false, autoRefreshToken: false } });
    const subUser: any = await withRetry(() => sb.from("sub_users")
      .select("parent_user_id, ativo").eq("auth_user_id", userId).maybeSingle());
    const ownerId = subUser?.ativo && subUser.parent_user_id ? subUser.parent_user_id : userId;

    // Cada feed consulta exclusivamente os roteiros da estação solicitada.
    const allUserRoteiros: any[] = (await withRetry(() => sb
      .from("roteiros")
      .select("id, programa_nome, estudio, data_programa, horario, participantes, subtitulo, conteudo_html, xml_pushed_at, created_at, updated_at")
      .eq("user_id", ownerId)
      .order("xml_pushed_at", { ascending: false, nullsFirst: false })
      .order("updated_at", { ascending: false })
      .limit(200))) || [];

    const norm = (s: string) =>
      String(s || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
    const studioKey = (s: string) => {
      const value = norm(s);
      if (value.includes("PODCAST")) return "PODCAST";
      if (value.includes("FM") || value.includes("ESTUDIO PRINCIPAL") || value === "PRINCIPAL") return "FM";
      return value;
    };

    const targetEst = studioKey(estudio);
    const nowLocal = new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const todayLocal = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, "0")}-${String(nowLocal.getDate()).padStart(2, "0")}`;
    const studioCandidates = (allUserRoteiros || []).filter((r: any) => studioKey(r.estudio) === targetEst);
    const todayCandidates = studioCandidates.filter((r: any) => String(r.data_programa || "").slice(0, 10) === todayLocal);
    const contentCandidates = studioCandidates.filter((r: any) => String(r.conteudo_html || "").trim().length > 0);
    const todayWithContent = todayCandidates.filter((r: any) => String(r.conteudo_html || "").trim().length > 0);
    // Ignora rascunhos vazios. Prioriza pauta com conteúdo real e, depois, a publicação mais recente.
    let candidates = todayWithContent.length > 0 ? todayWithContent
      : contentCandidates.length > 0 ? contentCandidates
      : todayCandidates.length > 0 ? todayCandidates
      : studioCandidates;

    // Carrega horarios dos programas para fallback
    let progs: any[] = [];
    try {
      progs = (await withRetry(() => sb.from("programas").select("nome, horario_inicio").eq("user_id", ownerId), 2)) || [];
    } catch (e) { console.warn("[serve-xml-roteiro-estudio] programas fallback:", String(e)); }
    const progMap = new Map<string, string>();
    (progs || []).forEach((p: any) => { if (p.nome) progMap.set(p.nome, (p.horario_inicio || "").slice(0, 5)); });

    // Entre os roteiros do dia e estúdio exatos, prevalece a edição mais recente.
    candidates.sort((a: any, b: any) => {
      const tsA = new Date(a.xml_pushed_at || a.updated_at || a.created_at || 0).getTime();
      const tsB = new Date(b.xml_pushed_at || b.updated_at || b.created_at || 0).getTime();
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
      xml += `  <atualizado_em>${esc(r.xml_pushed_at || r.updated_at || r.created_at || "")}</atualizado_em>\n`;
      const rawHtml = String(r.conteudo_html || "");
      let htmlForVmix = rawHtml;
      const imageUrls = Array.from(new Set(rawHtml.match(/https?:\/\/[^"'\s<>]+/g) || []))
        .filter((imageUrl) => /\.(?:webp|jpe?g|png|gif)(?:[?#]|$)/i.test(imageUrl));
      for (const imageUrl of imageUrls) {
        const pngUrl = await ensureVmixPngUrl(sb, imageUrl, `vmix-roteiro/${ownerId}`);
        if (pngUrl) htmlForVmix = htmlForVmix.split(imageUrl).join(pngUrl);
      }
      const roteiroTexto = rawHtml
        .replace(/<\/(?:p|h[1-6]|li|section|div)>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/[ \t]+/g, " ")
        .replace(/\n\s*\n+/g, "\n")
        .trim();
      if (htmlForVmix) {
        xml += `  <conteudo_html>${esc(htmlForVmix)}</conteudo_html>\n`;
        xml += `  <roteiro_texto>${esc(roteiroTexto)}</roteiro_texto>\n`;
      }
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

        const imagens: string[] = await Promise.all((podcastData.apoioImagens || []).filter((u: string) => u && u.trim()).map((u: string) => ensureVmixPngUrl(sb, u, `vmix-roteiro/${ownerId}`)));
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
          for (let i = 0; i < escaladaItems.length; i++) {
            const e = escaladaItems[i];
            const image = await ensureVmixPngUrl(sb, typeof e === "string" ? "" : e.imagemUrl || "", `vmix-roteiro/${ownerId}`);
            xml += `    <item ordem="${i + 1}">\n      <titulo>${esc(typeof e === "string" ? e : e.titulo || "")}</titulo>\n      <imagem>${esc(image)}</imagem>\n    </item>\n`;
          }
          xml += `  </escalada>\n`;
        }
        for (let bi = 0; bi < blocosList.length; bi++) {
          const b = blocosList[bi];
          xml += `  <bloco numero="${bi + 1}">\n`;
          const noticias = noticiasComCampoFixo(b.noticias || [], parts.campoFixo, bi === 0);
          for (let ni = 0; ni < noticias.length; ni++) {
            const n = noticias[ni];
            if (!n?.titulo) continue;
            const image = await ensureVmixPngUrl(sb, n.imagemUrl || "", `vmix-roteiro/${ownerId}`);
            xml += `    <noticia ordem="${ni + 1}">\n      <titulo>${esc(n.titulo)}</titulo>\n      <imagem>${esc(image)}</imagem>\n      <escalada>${n.escalada ? "true" : "false"}</escalada>\n    </noticia>\n`;
          }
          xml += `  </bloco>\n`;
        }
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
