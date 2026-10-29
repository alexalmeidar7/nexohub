import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const esc = (s: string) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const toSeconds = (time: string) => {
  const [hour = "0", minute = "0", second = "0"] = String(time ?? "").split(":");
  return Number(hour) * 3600 + Number(minute) * 60 + Number(second);
};

const isTimeInRange = (start: string, end: string, current: string) => {
  const startSeconds = toSeconds(start);
  const endSeconds = toSeconds(end);
  const currentSeconds = toSeconds(current);

  if (endSeconds <= startSeconds) {
    return currentSeconds >= startSeconds || currentSeconds < endSeconds;
  }

  return currentSeconds >= startSeconds && currentSeconds < endSeconds;
};

async function fetchDeezerArtistImage(artist: string): Promise<string> {
  if (!artist) return "";
  // Pega apenas o primeiro artista (antes de /, &, feat, ,)
  const primary = artist
    .split(/[\/&,]| feat\.?| ft\.?| with /i)[0]
    .trim();
  const query = primary || artist;
  try {
    const res = await fetch(
      `https://api.deezer.com/search/artist?q=${encodeURIComponent(query)}&limit=1`,
    );
    if (!res.ok) return "";
    const json = await res.json();
    const pic = json?.data?.[0]?.picture_xl || json?.data?.[0]?.picture_big || "";
    return pic || "";
  } catch {
    return "";
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const xmlHeaders = {
    ...corsHeaders,
    "Content-Type": "application/xml; charset=utf-8",
    "Cache-Control": "no-cache, no-store, must-revalidate",
  };

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("uid") || url.searchParams.get("user_id");

    if (!userId) {
      return new Response(`<?xml version="1.0" encoding="UTF-8"?><error>uid required</error>`, {
        headers: xmlHeaders,
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Programa no ar conforme grade (fuso America/Sao_Paulo)
    const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const now = new Date();
    const tzParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const wkShort = tzParts.find((p) => p.type === "weekday")?.value || "Sun";
    const hh = tzParts.find((p) => p.type === "hour")?.value || "00";
    const mm = tzParts.find((p) => p.type === "minute")?.value || "00";
    const ss = tzParts.find((p) => p.type === "second")?.value || "00";
    const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const todayIndex = dayMap[wkShort] ?? 0;
    const today = dayNames[todayIndex];
    const yesterday = dayNames[(todayIndex + 6) % 7];
    const nowTime = `${hh}:${mm}:${ss}`;

    const { data: progs, error: programsError } = await supabase
      .from("programas")
      .select("id, nome, dias_semana, horario_inicio, horario_fim, ativo, apresentador_id, apresentadores_ids, capa, thumb, estudio")
      .eq("user_id", userId)
      .eq("ativo", true)
      .ilike("estudio", "%fm%")
      .order("horario_inicio", { ascending: false });
    if (programsError) throw programsError;

    // Prioriza programas iniciados ontem que atravessam a meia-noite;
    // em seguida considera a grade normal do dia atual.
    const onAir =
      (progs || []).find((p: any) => {
        const start = toSeconds(p.horario_inicio);
        const end = toSeconds(p.horario_fim);
        const current = toSeconds(nowTime);
        return (
          end <= start &&
          (p.dias_semana || []).includes(yesterday) &&
          current < end
        );
      }) ||
      (progs || []).find((p: any) =>
        (p.dias_semana || []).includes(today) &&
        isTimeInRange(p.horario_inicio, p.horario_fim, nowTime),
      );

    // Apresentador (foto)
    let apresentadorNome = "";
    let apresentadorFoto = "";
    if (onAir) {
      const apresId =
        (onAir.apresentadores_ids && onAir.apresentadores_ids[0]) || onAir.apresentador_id;
      if (apresId) {
        const { data: apres } = await supabase
          .from("apresentadores")
          .select("nome, foto")
          .eq("id", apresId)
          .maybeSingle();
        if (apres) {
          apresentadorNome = apres.nome || "";
          apresentadorFoto = apres.foto || "";
        }
      }
    }

    // Logo do patrocinador (1 por vez, rotação a cada 10s)
    let patrocinadorNome = "";
    let patrocinadorUrl = "";
    if (onAir) {
      const { data: logos } = await supabase
        .from("logos_patrocinadores")
        .select("nome, logo_url")
        .eq("user_id", userId)
        .eq("programa_id", onAir.id)
        .eq("ativo", true)
        .eq("excluido", false)
        .order("created_at", { ascending: true });
      const list = logos || [];
      if (list.length > 0) {
        const slot = Math.floor(Date.now() / 10000) % list.length;
        const escolhida = list[slot];
        patrocinadorNome = escolhida.nome || "";
        patrocinadorUrl = escolhida.logo_url || "";
        if (/\.webp(?:$|[?#])/i.test(patrocinadorUrl)) {
          patrocinadorUrl = "https://wsrv.nl/?url=" + encodeURIComponent(patrocinadorUrl) + "&output=png";
        }
      }
    }

    // Música atual: prioriza o snapshot em user_settings.dashboard_items
    // (atualizado a cada 2s pelo cliente via useGlobalMusicSync — reflete
    // fielmente o XML/arquivo local mesmo em jingles/breaks que não geram
    // novas linhas em musicas_tocadas por causa da regra de deduplicação).
    let titulo = "";
    let artista = "";
    let capa = "";
    const { data: userSettings } = await supabase
      .from("user_settings")
      .select("dashboard_items, updated_at")
      .eq("user_id", userId)
      .maybeSingle();
    const rawDashboard = userSettings?.dashboard_items;
    const items = (typeof rawDashboard === "string"
      ? (() => { try { return JSON.parse(rawDashboard); } catch { return {}; } })()
      : (rawDashboard || {})) as Record<string, any>;
    // Compatibilidade com o formato estruturado usado pelo Broadcast JSON.
    // Algumas versões do sincronizador publicam musicData em vez dos campos planos.
    const musicData = (items.musicData || {}) as Record<string, unknown>;
    const liveTitle = String(items.music_current_title || musicData.musica || musicData.titulo || "").trim();
    const liveArtist = String(items.music_current_artist || musicData.artista || "").trim();
    const liveCover = String(items.music_current_cover || musicData.capa || musicData.cover || musicData.imagem || "").trim();
    // updated_at acompanha a gravação do snapshot; music_start_time é o início da faixa.
    const snapshotUpdatedAt = userSettings?.updated_at ? new Date(userSettings.updated_at).getTime() : 0;
    const isLive = Boolean(liveTitle) && snapshotUpdatedAt > 0 && Date.now() - snapshotUpdatedAt < 5 * 60 * 1000;
    if (isLive && liveTitle) {
      titulo = liveTitle;
      artista = liveArtist;
      capa = liveCover;
    } else {
      const { data: ultimaMusica } = await supabase
        .from("musicas_tocadas")
        .select("musica, artista")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (ultimaMusica) {
        titulo = ultimaMusica.musica || "";
        artista = ultimaMusica.artista || "";
      }
    }

    // Capa via iTunes (se ainda não veio do snapshot) — paralelizado com
    // Deezer para reduzir latência total do endpoint. vMix pode consultar
    // este XML a cada 1-2s; qualquer await sequencial extra atrasa a
    // atualização de "música no ar".
    const itunesCoverPromise: Promise<string> = (!capa && titulo && artista)
      ? (async () => {
          try {
            const q = encodeURIComponent(`${artista} ${titulo}`);
            const r = await fetch(`https://itunes.apple.com/search?term=${q}&limit=1&media=music`, {
              signal: AbortSignal.timeout(2500),
            });
            if (!r.ok) return "";
            const j = await r.json();
            const art = j?.results?.[0]?.artworkUrl100 || "";
            return art ? art.replace("100x100", "600x600") : "";
          } catch {
            return "";
          }
        })()
      : Promise.resolve("");

    const [itunesCover, artistaImg] = await Promise.all([
      itunesCoverPromise,
      fetchDeezerArtistImage(artista),
    ]);
    if (!capa && itunesCover) capa = itunesCover;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<vmix_live>
  <programa>
    <id>${esc(onAir?.id || "")}</id>
    <nome>${esc(onAir?.nome || "")}</nome>
    <horario_inicio>${esc(onAir?.horario_inicio || "")}</horario_inicio>
    <horario_fim>${esc(onAir?.horario_fim || "")}</horario_fim>
    <capa>${esc((onAir as any)?.capa || (onAir as any)?.thumb || "")}</capa>
  </programa>
  <apresentador>
    <nome>${esc(apresentadorNome)}</nome>
    <foto>${esc(apresentadorFoto)}</foto>
  </apresentador>
  <musica>
    <titulo>${esc(titulo)}</titulo>
    <artista>${esc(artista)}</artista>
    <capa>${esc(capa)}</capa>
    <artista_imagem>${esc(artistaImg)}</artista_imagem>
  </musica>
  <patrocinador>
    <nome>${esc(patrocinadorNome)}</nome>
    <url>${esc(patrocinadorUrl)}</url>
  </patrocinador>
</vmix_live>`;

    return new Response(xml, { headers: xmlHeaders });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(`<?xml version="1.0" encoding="UTF-8"?><error>${esc(msg)}</error>`, {
      headers: xmlHeaders,
    });
  }
});
