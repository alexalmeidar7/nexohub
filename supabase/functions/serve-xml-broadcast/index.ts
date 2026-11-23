import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveBroadcastAseguir } from "../_shared/broadcastAseguirSchedule.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");

const fetchWithTimeout = async (input: string, init: RequestInit = {}, ms = 6000): Promise<Response> => {
  return await fetch(input, { ...init, signal: AbortSignal.timeout(ms) });
};

const RSS_BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":
    "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.9, */*;q=0.8",
  "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
  "Cache-Control": "no-cache",
};

const decodeRssEntities = (s: string): string =>
  (s || "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));

const extractRssTitles = (xml: string): string[] => {
  const titles: string[] = [];
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi) || [];
  for (const b of blocks) {
    const m = b.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    if (!m) continue;
    let t = decodeRssEntities(m[1]).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (t.includes("|")) t = t.split("|")[0].trim();
    if (t && t.length > 3) titles.push(t);
    if (titles.length >= 15) break;
  }
  return titles;
};

const fetchRssTitles = async (url: string): Promise<string[]> => {
  try {
    const u = new URL(url);
    if (!/^https?:$/.test(u.protocol)) return [];
    u.searchParams.set("_lvcb", Date.now().toString());
    const finalUrl = u.toString();
    const candidates: Array<{ url: string; timeout: number }> = [
      { url: finalUrl, timeout: 5000 },
      { url: `https://r.jina.ai/${finalUrl}`, timeout: 7000 },
      { url: `https://proxy.cors.sh/${finalUrl}`, timeout: 7000 },
    ];
    for (const c of candidates) {
      try {
        const r = await fetch(c.url, { headers: RSS_BROWSER_HEADERS, signal: AbortSignal.timeout(c.timeout), redirect: "follow" });
        // Even if status not-ok, some proxies still return usable body — try to parse regardless
        const text = await r.text().catch(() => "");
        if (!text) continue;
        const t = extractRssTitles(text);
        if (t.length > 0) return t;
      } catch { /* try next */ }
    }
  } catch { /* ignore */ }
  return [];
};

const timeToSeconds = (value: string | null | undefined): number => {
  if (!value) return -1;

  const [hours = "0", minutes = "0", seconds = "0"] = value.split(":");
  const total = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);

  return Number.isFinite(total) ? total : -1;
};

const normalizeDateValue = (value: string | null | undefined): string =>
  (value || "").trim().slice(0, 10);

const resolveDataOwnerId = async (
  supabase: any,
  requestedUserId: string,
): Promise<string> => {
  const { data: subUser } = await supabase
    .from("sub_users")
    .select("parent_user_id, ativo")
    .eq("auth_user_id", requestedUserId)
    .maybeSingle();

  if (subUser?.ativo && subUser.parent_user_id) {
    return subUser.parent_user_id;
  }

  return requestedUserId;
};

const getCurrentProgramSortKey = (
  nowSeconds: number,
  startTime: string | null | undefined,
  endTime: string | null | undefined,
  weekDays: string[] | null | undefined,
  todayName: string,
  yesterdayName: string,
  isVariable: boolean | null | undefined,
  programDate: string | null | undefined,
  todayDate: string,
  yesterdayDate: string,
): number => {
  const startSeconds = timeToSeconds(startTime);
  const endSeconds = timeToSeconds(endTime);
  const days = Array.isArray(weekDays) ? weekDays : [];
  const normalizedProgramDate = normalizeDateValue(programDate);

  if (startSeconds < 0 || endSeconds < 0) return -1;

  const runsToday = isVariable
    ? normalizedProgramDate === todayDate
    : days.includes(todayName);
  const ranYesterday = isVariable
    ? normalizedProgramDate === yesterdayDate
    : days.includes(yesterdayName);
  const crossesMidnight = endSeconds <= startSeconds;

  if (!crossesMidnight) {
    return runsToday && nowSeconds >= startSeconds && nowSeconds < endSeconds
      ? startSeconds
      : -1;
  }

  if (runsToday && nowSeconds >= startSeconds) {
    return startSeconds;
  }

  if (ranYesterday && nowSeconds < endSeconds) {
    return startSeconds - 86400;
  }

  return -1;
};

const normalizeImageUrl = (value: string | null | undefined, size = 512): string => {
  const trimmed = (value || "").trim();

  if (!trimmed || trimmed.startsWith("data:")) {
    return trimmed;
  }

  try {
    const parsed = new URL(trimmed);

    if (
      parsed.pathname.includes("/storage/v1/object/public/") &&
      /\.webp$/i.test(parsed.pathname)
    ) {
      parsed.pathname = parsed.pathname.replace(
        "/storage/v1/object/public/",
        "/storage/v1/render/image/public/",
      );

      if (!parsed.searchParams.has("width")) {
        parsed.searchParams.set("width", String(size));
        parsed.searchParams.set("height", String(size));
        parsed.searchParams.set("resize", "contain");
      }

      return parsed.toString();
    }

    return trimmed;
  } catch {
    return trimmed;
  }
};

const ensurePngExtension = (url: string | null | undefined): string => {
  if (!url) return "";
  let clean = url.trim();
  clean = clean.replace(/\.web(p)?(\?.*)?$/i, (match, p1, query) => `.png${query || ""}`);
  return clean;
};

const base64ToUint8Array = (dataUrl: string): { data: Uint8Array; contentType: string } => {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL");
  const raw = atob(match[2]);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return { data: arr, contentType: match[1] };
};

const uploadPublicPng = async (
  supabase: any,
  storagePath: string,
  data: Uint8Array,
): Promise<string> => {
  const { error } = await supabase.storage
    .from("xml-files")
    .upload(storagePath, data, { upsert: true, contentType: "image/png", cacheControl: "3600" });
  if (error) throw error;
  const { data: urlData } = supabase.storage.from("xml-files").getPublicUrl(storagePath);
  return (urlData?.publicUrl || "").split("?")[0];
};

// Sidecar marker to detect when the source URL changed and we must re-upload the PNG.
const sourceMarkerPath = (storagePath: string) => `${storagePath}.src.txt`;

const readSourceMarker = async (
  supabase: any,
  storagePath: string,
): Promise<string> => {
  try {
    const { data } = await supabase.storage.from("xml-files").download(sourceMarkerPath(storagePath));
    if (!data) return "";
    return (await data.text()).trim();
  } catch {
    return "";
  }
};

const writeSourceMarker = async (
  supabase: any,
  storagePath: string,
  source: string,
) => {
  try {
    await supabase.storage.from("xml-files").upload(
      sourceMarkerPath(storagePath),
      new Blob([source], { type: "text/plain" }),
      { upsert: true, contentType: "text/plain", cacheControl: "60" },
    );
  } catch {
    // ignore
  }
};

const withVersion = (url: string, version?: string | null) => {
  if (!url) return "";
  const clean = url.split("?")[0].split("#")[0];
  if (!version) return clean;
  const v = String(new Date(version).getTime() || version).slice(-10);
  return `${clean}?v=${v}`;
};

const ensurePngImageUrl = async (
  supabase: any,
  value: string | null | undefined,
  storagePath: string,
  size = 512,
  version?: string | null,
): Promise<string> => {
  const trimmed = (value || "").trim();
  if (!trimmed) return "";

  if (trimmed.startsWith("data:image/") && trimmed.includes(";base64,")) {
    try {
      const { data } = base64ToUint8Array(trimmed);
      const url = await uploadPublicPng(supabase, storagePath, data);
      await writeSourceMarker(supabase, storagePath, trimmed.slice(0, 200));
      return withVersion(url, version);
    } catch {
      return "";
    }
  }

  if (!/^https?:\/\//i.test(trimmed)) return "";

  const cleanUrl = trimmed.split("?")[0].split("#")[0];
  
  // If it's already a PNG and we want original size (1920x1080 is the signal for Banner L), 
  // return the original URL with version to avoid resizing.
  if (/\.png$/i.test(cleanUrl) && size === 1920) return withVersion(trimmed, version);

  try {
    // Re-upload only if source URL changed (or marker missing).
    const previousSource = await readSourceMarker(supabase, storagePath);
    const sourceKey = trimmed.split("#")[0];
    if (previousSource && previousSource === sourceKey) {
      const { data: urlData } = supabase.storage.from("xml-files").getPublicUrl(storagePath);
      const existing = (urlData?.publicUrl || "").split("?")[0];
      if (existing) return withVersion(existing, version);
    }
    const source = trimmed.replace(/^https?:\/\//i, "");
    const height = size === 1920 ? 1080 : size;
    const fitMode = size === 1920 ? "inside" : "cover";
    const fetchUrl = `https://wsrv.nl/?url=${encodeURIComponent(source)}&output=png&w=${size}&h=${height}&fit=${fitMode}&we&a=center`;
    const response = await fetchWithTimeout(fetchUrl);
    if (!response.ok) return "";
    const bytes = new Uint8Array(await response.arrayBuffer());
    const url = await uploadPublicPng(supabase, storagePath, bytes);
    await writeSourceMarker(supabase, storagePath, sourceKey);
    return withVersion(url, version);
  } catch {
    return "";
  }
};

// Static white social icons (PNG, white variant)
const SOCIAL_ICONS: Record<string, string> = {
  instagram: "https://img.icons8.com/ios-filled/200/ffffff/instagram-new.png",
  facebook: "https://img.icons8.com/ios-filled/200/ffffff/facebook-new.png",
  youtube: "https://img.icons8.com/ios-filled/200/ffffff/youtube-play.png",
  site: "https://img.icons8.com/ios-filled/200/ffffff/domain.png",
  whatsapp: "https://img.icons8.com/ios-filled/200/ffffff/whatsapp.png",
};

function extractHandle(raw: string): string {
  if (!raw) return "";
  try {
    const u = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts.length > 0 ? `@${parts[parts.length - 1]}` : raw;
  } catch {
    return raw.startsWith("@") ? raw : `@${raw}`;
  }
}

const serve = Deno.serve;

const fastSupabaseFetch: typeof fetch = (input, init = {}) =>
  fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(8000) });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("user_id");

    if (!userId) {
      return new Response(
        '<?xml version="1.0" encoding="UTF-8"?><error>user_id is required</error>',
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, { global: { fetch: fastSupabaseFetch }, auth: { persistSession: false, autoRefreshToken: false } });

    const dataOwnerId = await resolveDataOwnerId(supabase, userId);

    // Use the station's configured timezone so the on-air program is computed
    // against the local clock of the broadcaster, not the server's default.
    let tz = "America/Sao_Paulo";
    try {
      const { data: tzRow } = await supabase
        .from("empresa_config")
        .select("timezone")
        .eq("user_id", dataOwnerId)
        .maybeSingle();
      const cand = (tzRow?.timezone || "").toString().trim();
      if (cand) {
        // Validate — if invalid, DateTimeFormat throws.
        new Intl.DateTimeFormat("en-US", { timeZone: cand });
        tz = cand;
      }
    } catch {
      tz = "America/Sao_Paulo";
    }

    const now = new Date();
    const brFormatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const brParts = brFormatter.formatToParts(now);
    const hh = brParts.find((p) => p.type === "hour")?.value || "00";
    const mm = brParts.find((p) => p.type === "minute")?.value || "00";
    const ss = brParts.find((p) => p.type === "second")?.value || "00";
    const nowSeconds = Number(hh) * 3600 + Number(mm) * 60 + Number(ss);

    const dayFormatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: tz,
      weekday: "long",
    });
    const dateFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });

    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const dayMap: Record<string, string> = {
      "domingo": "Domingo",
      "segunda-feira": "Segunda",
      "terça-feira": "Terça",
      "quarta-feira": "Quarta",
      "quinta-feira": "Quinta",
      "sexta-feira": "Sexta",
      "sábado": "Sábado",
    };
    const todayName = dayMap[dayFormatter.format(now).toLowerCase()] || "Segunda";
    const yesterdayName = dayMap[dayFormatter.format(yesterday).toLowerCase()] || "Domingo";
    const todayDate = dateFormatter.format(now);
    const yesterdayDate = dateFormatter.format(yesterday);

    const WMO_LABELS: Record<number, string> = {
      0: "Ensolarado", 1: "Quase limpo", 2: "Parcialmente nublado", 3: "Nublado",
      45: "Neblina", 48: "Neblina densa", 51: "Garoa fraca", 53: "Garoa", 55: "Garoa intensa",
      61: "Chuva fraca", 63: "Chuva", 65: "Chuva forte", 71: "Neve fraca", 73: "Neve", 75: "Neve forte",
      80: "Pancadas de chuva", 81: "Pancadas fortes", 82: "Pancadas violentas",
      95: "Tempestade", 96: "Tempestade c/ granizo", 99: "Tempestade severa",
    };

    const [empRes, progsRes, roteiroRes, settingsRes, liveEventsRes] = await Promise.all([
      supabase
        .from("empresa_config")
        .select("nome, logo, instagram, facebook, youtube, site, telefone_participacao, updated_at")
        .eq("user_id", dataOwnerId)
        .maybeSingle(),
      supabase
        .from("programas")
        .select("id, nome, selo, thumb, capa, apresentadores_ids, apresentador_id, dias_semana, horario_inicio, horario_fim, variavel, data_variavel, estudio")
        .eq("user_id", dataOwnerId)
        .eq("ativo", true),
      supabase
        .from("roteiros")
        .select("id, titulo, tickertitulos, updated_at")
        .eq("user_id", dataOwnerId)
        .ilike("estudio", "%fm%")
        .in("tipo_programa", ["Jornalístico", "express"])
        .not("tickertitulos", "is", null)
        .neq("tickertitulos", "")
        .order("updated_at", { ascending: false })
        .limit(50),
      supabase
        .from("user_settings")
        .select("cenario_config, weather_lat, weather_lon, weather_city, dashboard_items, last_manual_curiosity_id")
        .eq("user_id", dataOwnerId)
        .maybeSingle(),
      supabase
        .from("agenda_eventos")
        .select("id, programa_id, data, tipo_evento, artes_urls")
        .eq("user_id", dataOwnerId)
        .eq("data", todayDate)
        .eq("tipo_evento", "live"),
    ]);

    // O endpoint de música é consumido em alta frequência pelo vMix.
    // Retorna imediatamente após carregar o snapshot, sem executar RSS,
    // clima, cotações, curiosidades ou processamento de imagens do Broadcast.
    if (url.searchParams.get("tipo") === "musica") {
      const dashboard = (settingsRes.data?.dashboard_items || {}) as Record<string, any>;
      const musicData = (dashboard.musicData || {}) as Record<string, any>;
      const musicaAtual = String(musicData.musica || dashboard.music_current_title || "").trim();
      const artistaAtual = String(musicData.artista || dashboard.music_current_artist || "").trim();
      const musicaCapa = String(musicData.capa || dashboard.music_current_cover || "").trim();
      const deezerArtistImg = String(musicData.deezer_artist_img || dashboard.music_deezer_artist_img || "").trim();
      const curiosidade = String(dashboard.music_current_curiosity || "");
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<items>
  <dados>
    <musica_atual>${esc(musicaAtual)}</musica_atual>
    <artista_atual>${esc(artistaAtual)}</artista_atual>
    <musica_capa>${esc(ensurePngExtension(musicaCapa))}</musica_capa>
    <deezer_artist_img>${esc(ensurePngExtension(deezerArtistImg))}</deezer_artist_img>
    <info_music>${esc(curiosidade)}</info_music>
  </dados>
</items>`;
      return new Response(xml, {
        headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
      });
    }

    const emp = empRes.data;
    // Broadcast XML is FM-only: never surface Podcast studio programs.
    const isFmStudio = (studio: string | null | undefined): boolean => {
      const value = (studio || "").toLowerCase();
      if (value.includes("podcast")) return false;
      return value.includes("fm");
    };
    const activePrograms = (progsRes.data || [])
      .filter((item) => isFmStudio((item as any).estudio))
      .map((item) => ({

        item,
        sortKey: getCurrentProgramSortKey(
          nowSeconds,
          item.horario_inicio,
          item.horario_fim,
          item.dias_semana,
          todayName,
          yesterdayName,
          item.variavel,
          item.data_variavel,
          todayDate,
          yesterdayDate,
        ),
        isVariavelHoje:
          !!item.variavel && normalizeDateValue(item.data_variavel) === todayDate,
        endSec: timeToSeconds(item.horario_fim),
      }))
      .filter((entry) => entry.sortKey >= 0);

    // Variable special program for today only counts while still inside its time window.
    // Once it ends, fall back to the recurring grade program covering "now".
    const studioPriority = (studio: string | null | undefined): number => {
      const value = (studio || "").toLowerCase();
      if (value.includes("estúdio fm") || value.includes("estudio fm")) return 3;
      if (value.includes("principal") || value.includes("ao vivo")) return 2;
      return 1;
    };

    const compareCurrentPrograms = (a: typeof activePrograms[number], b: typeof activePrograms[number]) => {
      const priorityDifference = studioPriority(b.item.estudio) - studioPriority(a.item.estudio);
      return priorityDifference || b.sortKey - a.sortKey;
    };

    const variavelAtivo = activePrograms
      .filter((e) => e.isVariavelHoje && nowSeconds < e.endSec)
      .sort(compareCurrentPrograms)[0];
    const recorrenteAtivo = activePrograms
      .filter((e) => !e.isVariavelHoje)
      .sort(compareCurrentPrograms)[0];

    const prog = (variavelAtivo || recorrenteAtivo)?.item || null;


    let programaNome = "";
    let programaLogo = "";
    let programaThumb = "";
    let locutorNome = "";
    let locutorInstagram = "";
    let locutorFoto = "";
    let programaId = "";

    if (prog) {
      programaNome = prog.nome || "";
      programaId = prog.id || "";
      programaLogo = prog.selo
        ? await ensurePngImageUrl(supabase, prog.selo, `broadcast/${dataOwnerId}/${prog.id}-logo.png`, 512)
        : "";
      const thumbSource = ((prog as any).thumb || (prog as any).capa || prog.selo || "").toString().trim();
      programaThumb = thumbSource
        ? await ensurePngImageUrl(supabase, thumbSource, `broadcast/${dataOwnerId}/${prog.id}-thumb-hd.png`, 1920)
        : "";

      const apIds = (prog.apresentadores_ids && prog.apresentadores_ids.length > 0)
        ? prog.apresentadores_ids
        : (prog.apresentador_id ? [prog.apresentador_id] : []);

      if (apIds.length > 0) {
        const { data: presenters } = await supabase
          .from("apresentadores")
          .select("id, nome, instagram, foto")
          .eq("user_id", dataOwnerId)
          .in("id", apIds);

        const ap = (presenters || [])
          .sort((a, b) => apIds.indexOf(a.id) - apIds.indexOf(b.id))[0];

        if (ap) {
          locutorNome = ap.nome || "";
          locutorInstagram = ap.instagram ? extractHandle(ap.instagram) : "";
          locutorFoto = ap.foto
            ? await ensurePngImageUrl(supabase, ap.foto, `broadcast/${dataOwnerId}/${ap.id}-locutor.png`, 1080)
            : "";
        }
      }
    }

    let sponsorLogos: { id: string; nome: string; logo_url: string; created_at?: string }[] = [];
    if (programaId) {
      // Sempre lê direto do banco: logos inseridas aparecem e excluídas/vencidas saem imediatamente.
      const { data: logos } = await supabase
        .from("logos_patrocinadores")
        .select("id, nome, logo_url, created_at, data_final, ativo, excluido, excluido_at")
        .eq("user_id", dataOwnerId)
        .eq("programa_id", programaId)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true });
      const todayStr = now.toISOString().slice(0, 10);
      sponsorLogos = ((logos || []) as any[]).filter((l) =>
        l.logo_url &&
        l.ativo !== false &&
        l.excluido !== true &&
        !l.excluido_at &&
        (!l.data_final || String(l.data_final).slice(0, 10) >= todayStr)
      );
    }

    const socialItems: { handle: string; icon: string }[] = [];
    if (emp?.instagram) socialItems.push({ handle: extractHandle(emp.instagram), icon: SOCIAL_ICONS.instagram });
    if (emp?.facebook) socialItems.push({ handle: extractHandle(emp.facebook), icon: SOCIAL_ICONS.facebook });
    if (emp?.youtube) socialItems.push({ handle: extractHandle(emp.youtube), icon: SOCIAL_ICONS.youtube });
    if (emp?.site) {
      const raw = emp.site.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "");
      socialItems.push({ handle: raw, icon: SOCIAL_ICONS.site });
    }

    const whatsappRaw = emp?.telefone_participacao || "";
    const whatsappDigits = whatsappRaw.replace(/\D/g, "");
    if (whatsappDigits) {
      socialItems.push({ handle: whatsappRaw.trim(), icon: SOCIAL_ICONS.whatsapp });
    }

    // Cada rede social permanece visível por 4 segundos.
    const rotationSlot = Math.floor(now.getTime() / 4000);
    let redeSocialAtual = "";
    let redeSocialIcone = "";
    if (socialItems.length > 0) {
      const idx = rotationSlot % socialItems.length;
      redeSocialAtual = socialItems[idx].handle;
      redeSocialIcone = socialItems[idx].icon;
    }

    const qrLink = whatsappDigits ? `https://wa.me/${whatsappDigits}` : "";
    const broadcastConfig = (settingsRes.data?.cenario_config as any)?.broadcast || {};
    // Título/assunto: usa o assunto definido no Broadcast; se estiver vazio,
    // cai para "No Ar na <nome da emissora>" (configurações da emissora).
    const empresaNome = String((empRes.data as any)?.nome || "").trim();
    const assunto =
      String(broadcastConfig.assunto || "").trim() ||
      (empresaNome ? `No Ar na ${empresaNome}` : "");

    // Locutor override: if user defined a custom presenter name in Broadcast,
    // override locutorNome and try to enrich foto/instagram from registered apresentadores.
    const locutorOverride = (broadcastConfig.locutor_override || "").toString().trim();
    if (locutorOverride) {
      locutorNome = locutorOverride;
      const { data: apMatches } = await supabase
        .from("apresentadores")
        .select("id, nome, instagram, foto")
        .eq("user_id", dataOwnerId)
        .ilike("nome", locutorOverride);
      const ap = (apMatches || [])[0];
      if (ap) {
        locutorInstagram = ap.instagram ? extractHandle(ap.instagram) : "";
        locutorFoto = ap.foto
          ? await ensurePngImageUrl(supabase, ap.foto, `broadcast/${dataOwnerId}/${ap.id}-locutor.png`, 1080)
          : "";
      } else {
        // No matching presenter — clear instagram/foto so XML doesn't show stale data
        locutorInstagram = "";
        locutorFoto = "";
      }
    }

    const linkedProgIds: string[] = Array.isArray(broadcastConfig.assuntoBgProgramaIds) ? broadcastConfig.assuntoBgProgramaIds : [];
    const bgAppliesToCurrent = linkedProgIds.length === 0 || (programaId && linkedProgIds.includes(programaId));
    const fundoAssunto = broadcastConfig.useCustomAssuntoBg && broadcastConfig.assuntoBgUrl && bgAppliesToCurrent ? broadcastConfig.assuntoBgUrl : "";

    // A Seguir text: the XML is blank by default. Automatic windows are
    // calculated from the grade; manual triggers are persisted per station.
    const aSeguirEnabled = !!broadcastConfig.aSeguirEnabled;
    const rawRefresh = Number(broadcastConfig.aSeguirRefreshSeconds);
    const aSeguirRefreshSeconds = Number.isFinite(rawRefresh) && rawRefresh > 0 ? Math.round(rawRefresh) : 60;
    let manualAseguir: { mode: "next" | "later"; triggered_at: string; expires_at: string } | null = null;
    if (aSeguirEnabled) {
      const { data: manual, error: pulseError } = await supabase
        .from("broadcast_aseguir_pulses")
        .select("mode,triggered_at,expires_at")
        .eq("user_id", dataOwnerId)
        .gte("expires_at", new Date().toISOString())
        .maybeSingle();
      if (!pulseError && (manual?.mode === "next" || manual?.mode === "later")) {
        manualAseguir = {
          mode: manual.mode === "later" ? "later" : "next",
          triggered_at: String(manual.triggered_at),
          expires_at: String(manual.expires_at),
        };
      }
    }

    const tickerParts: string[] = [];
    const rssEnabled = !!(broadcastConfig.tickerRssEnabled && typeof broadcastConfig.tickerRssUrl === "string" && broadcastConfig.tickerRssUrl.trim());
    if (broadcastConfig.tickerNews || rssEnabled) {
      let titulos = "";
      // Prefer custom RSS/XML feed when enabled — runs independently of tickerNews
      if (rssEnabled) {
        const rssTitles = await fetchRssTitles(broadcastConfig.tickerRssUrl.trim());
        if (rssTitles.length > 0) titulos = rssTitles.join("  •  ");
      }
      if (!titulos && broadcastConfig.tickerNews) {
        // Respeita a fonte escolhida na tela Broadcast. Sem seleção explícita,
        // usa o roteiro jornalístico mais recentemente atualizado.
        const roteirosComTicker = Array.isArray(roteiroRes.data) ? roteiroRes.data : [];
        const roteiroSelecionado = broadcastConfig.tickerNewsRoteiroId
          ? roteirosComTicker.find((roteiro: any) => String(roteiro.id) === String(broadcastConfig.tickerNewsRoteiroId))
          : roteirosComTicker[0];
        titulos = String(roteiroSelecionado?.tickertitulos || "").trim();
      }
      if (titulos) tickerParts.push(titulos);
    }
    if (broadcastConfig.tickerWeather && settingsRes.data?.weather_lat && settingsRes.data?.weather_lon) {
      try {
        const lat = settingsRes.data.weather_lat;
        const lon = settingsRes.data.weather_lon;
        const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=2&timezone=America/Sao_Paulo`;
        const wxRes = await fetchWithTimeout(wxUrl);
        if (wxRes.ok) {
          const d = await wxRes.json();
          const t = Math.round(d.current?.temperature_2m);
          const label = WMO_LABELS[d.current?.weather_code] || "—";
          let tomorrow = "";
          if (d.daily?.temperature_2m_min?.[1] !== undefined) {
            const tMin = Math.round(d.daily.temperature_2m_min[1]);
            const tMax = Math.round(d.daily.temperature_2m_max[1]);
            const tLabel = WMO_LABELS[d.daily.weather_code?.[1]] || "—";
            tomorrow = ` | Amanhã: ${tMin}°–${tMax}° ${tLabel}`;
          }
          const city = settingsRes.data.weather_city || "";
          tickerParts.push(`${city ? city + ": " : ""}Agora ${t}° ${label}${tomorrow}`);
        }
      } catch { /* silent */ }
    }
    if (broadcastConfig.tickerQuotes) {
      const qParts: string[] = [];
      try {
        const cRes = await fetchWithTimeout("https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL");
        if (cRes.ok) {
          const cd = await cRes.json();
          const fmt = (v: string) => parseFloat(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          if (cd.USDBRL) {
            const pct = parseFloat(cd.USDBRL.pctChange);
            qParts.push(`Dólar R$ ${fmt(cd.USDBRL.bid)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`);
          }
          if (cd.EURBRL) {
            const pct = parseFloat(cd.EURBRL.pctChange);
            qParts.push(`Euro R$ ${fmt(cd.EURBRL.bid)} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`);
          }
        }
      } catch { /* silent */ }
      try {
        const symbols = [
          { s: "^BVSP", n: "Ibovespa" },
          { s: "^GSPC", n: "S&P 500" },
          { s: "^DJI", n: "Dow Jones" },
          { s: "^IXIC", n: "Nasdaq" },
        ];
        for (const { s, n } of symbols) {
          try {
            const r = await fetchWithTimeout(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(s)}?interval=1d&range=1d`, {
              headers: { "User-Agent": "Mozilla/5.0" },
            });
            if (!r.ok) continue;
            const j = await r.json();
            const meta = j?.chart?.result?.[0]?.meta;
            const price = meta?.regularMarketPrice ?? 0;
            const prev = meta?.chartPreviousClose ?? meta?.previousClose ?? price;
            if (!price) continue;
            const pct = prev > 0 ? ((price - prev) / prev) * 100 : 0;
            const val = price >= 1000
              ? price.toLocaleString("pt-BR", { maximumFractionDigits: 2 })
              : price.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
            qParts.push(`${n} ${val} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`);
          } catch { /* silent */ }
        }
      } catch { /* silent */ }
      if (qParts.length) tickerParts.push(qParts.join(" | "));
    }
    if (broadcastConfig.tickerSocials && socialItems.length > 0) {
      const labels: Record<string, string> = {
        [SOCIAL_ICONS.instagram]: "Instagram",
        [SOCIAL_ICONS.facebook]: "Facebook",
        [SOCIAL_ICONS.youtube]: "YouTube",
        [SOCIAL_ICONS.site]: "Site",
        [SOCIAL_ICONS.whatsapp]: "WhatsApp",
      };
      for (const s of socialItems) {
        const label = labels[s.icon] || "";
        tickerParts.push(`${label ? label + ": " : ""}${s.handle}`);
      }
    }
    if (broadcastConfig.ticker) tickerParts.push(broadcastConfig.ticker);
    let ticker: string;
    if (broadcastConfig.tickerUnitario && tickerParts.length > 0) {
      const slot = Math.floor(Date.now() / 4000) % tickerParts.length;
      ticker = tickerParts[slot];
    } else {
      ticker = tickerParts.join("  •  ");
    }

    // ── Active Promotions / Banners Rotation ──
    // Every 5 seconds, switch between active promotions. Prefers banner_l_url;
    // when the promotion has no dedicated "banner L", falls back to imagem_url
    // (the image registered on the Comercial/Promoções page).
    const today = new Date().toISOString().split("T")[0];
    const { data: promoData } = await supabase
      .from("promocoes")
      .select("banner_l_url, imagem_url")
      .eq("user_id", dataOwnerId)
      .lte("data_inicio", today)
      .gte("data_fim", today);

    const promoBanners = (promoData || [])
      .map((p: any) => String(p?.banner_l_url || p?.imagem_url || "").trim())
      .filter((u: string) => u.length > 0);

    let bannerLUrl = "";
    if (promoBanners.length > 0) {
      // Rotate every 5 seconds (using 5-second slots of Unix time)
      const promoSlot = Math.floor(Date.now() / 5000);
      const idx = promoSlot % promoBanners.length;
      bannerLUrl = await ensurePngImageUrl(
        supabase,
        promoBanners[idx],
        `broadcast/${dataOwnerId}/promo-banner-l-${idx}.png`,
        1920,
      );
    }

    // ── Music curiosity manual override ──
    // The dashbord sets music_curiosity_manual (text) and music_curiosity_manual_until (ISO timestamp)
    let curiosidade = "";
    let deezerArtistImg = "";
    const manualCuriosityText = (settingsRes.data?.dashboard_items as any)?.music_curiosity_manual;
    const manualCuriosityUntil = (settingsRes.data?.dashboard_items as any)?.music_curiosity_manual_until;
    const manualCuriosityImg = (settingsRes.data?.dashboard_items as any)?.music_curiosity_manual_img;
    
    if (manualCuriosityText && manualCuriosityUntil) {
      const untilMs = new Date(manualCuriosityUntil).getTime();
      if (Number.isFinite(untilMs) && Date.now() < untilMs) {
        curiosidade = manualCuriosityText;
        if (manualCuriosityImg) {
          const artistSlug = "manual_artist_" + Math.random().toString(36).substring(7);
          deezerArtistImg = await ensurePngImageUrl(supabase, manualCuriosityImg, `broadcast/${dataOwnerId}/artist-${artistSlug}.png`, 512);
        }
      }
    }

    // Se não houver substituição manual, usa a curiosidade da aba Info Music.
    // A curiosidade só pode ser publicada quando estiver vinculada à música
    // atualmente identificada no módulo Música no Ar.
    if (!curiosidade) {      const dashboard = (settingsRes.data?.dashboard_items as any) || {};
      const liveCuriosity = (dashboard.music_current_curiosity || "").toString().trim();
      if (liveCuriosity) {
        const curTitle = (dashboard.music_current_title || "").toString().trim().toLowerCase();
        const curArtist = (dashboard.music_current_artist || "").toString().trim().toLowerCase();
        const curSig = `${curArtist}|${curTitle}`;
        const boundSig = (dashboard.music_current_curiosity_track || "").toString().trim().toLowerCase();
        const expiresAtRaw = dashboard.music_current_curiosity_expires_at;
        const expiresMs = expiresAtRaw ? new Date(expiresAtRaw).getTime() : NaN;
        const notExpired = !Number.isFinite(expiresMs) || Date.now() < expiresMs;
        // Emit curiosity ONLY when it is bound to the track currently on-air
        // and hasn't passed its TTL. If either check fails, XML returns empty
        // immediately regardless of the DB write lag.
        if (curTitle && curArtist && boundSig === curSig && notExpired) {
          curiosidade = liveCuriosity;
        }
      }
    }

    
    // ── Music details ──
    if (!deezerArtistImg) {
      const dashboard = settingsRes.data?.dashboard_items as any || {};
      const musicData = dashboard.musicData || {};
      
      // Support both nested musicData (legacy/manual) and flat keys from useGlobalMusicSync
      const musicaAtual = musicData.musica || dashboard.music_current_title || "";
      const artistaAtual = musicData.artista || dashboard.music_current_artist || "";
      const deezerArtistImgRaw = musicData.deezer_artist_img || dashboard.music_deezer_artist_img || "";
      const artistSlug = (artistaAtual || "unknown").replace(/[^a-z0-9]/gi, "_").toLowerCase();
      
      let resolvedArtistImg = deezerArtistImgRaw;

      // Fallback: se o sistema ainda não gravou a imagem do artista, busca na Deezer.
      if (!resolvedArtistImg && artistaAtual) {
        try {
          const primary = String(artistaAtual).split(/[\/&,]| feat\.?| ft\.?| with /i)[0].trim();
          const res = await fetch(
            `https://api.deezer.com/search/artist?q=${encodeURIComponent(primary || artistaAtual)}&limit=1`,
            { signal: AbortSignal.timeout(2500) },
          );
          if (res.ok) {
            const json = await res.json();
            resolvedArtistImg = json?.data?.[0]?.picture_xl || json?.data?.[0]?.picture_big || "";
          }
        } catch { /* sem imagem do artista */ }
      }

      if (resolvedArtistImg) {
        deezerArtistImg = await ensurePngImageUrl(supabase, resolvedArtistImg, `broadcast/${dataOwnerId}/artist-${artistSlug}.png`, 512);
      }
    }
    
    const dashboard = settingsRes.data?.dashboard_items as any || {};
    const musicData = dashboard.musicData || {};
    const musicaAtual = musicData.musica || dashboard.music_current_title || "";
    const artistaAtual = musicData.artista || dashboard.music_current_artist || "";
    const musicaTexto = musicaAtual && artistaAtual ? `${musicaAtual} - ${artistaAtual}` : (musicaAtual || artistaAtual || "");
    const musicaCapaRaw = (musicData.capa || dashboard.music_current_cover || "").toString().trim();
    let musicaCapa = "";
    if (musicaCapaRaw) {
      const capaSlug = `${(artistaAtual || "unknown")}_${(musicaAtual || "track")}`.replace(/[^a-z0-9]/gi, "_").toLowerCase().slice(0, 60);
      const sourceVersion = musicaCapaRaw.replace(/[^a-z0-9]/gi, "").slice(-16) || String(Date.now());
      musicaCapa = await ensurePngImageUrl(
        supabase,
        musicaCapaRaw,
        `broadcast/${dataOwnerId}/music-cover-${capaSlug}.png`,
        512,
        sourceVersion,
      );
    }


    const BLANK_LOGO_URL = "https://zzjfzxxvxbspbdkodoix.supabase.co/storage/v1/object/public/xml-files/IMGBLANCK.png";
    let logoPatrocinador = BLANK_LOGO_URL;
    if (sponsorLogos.length > 0) {
      const idx = rotationSlot % sponsorLogos.length;
      const sponsor = sponsorLogos[idx];
      const generated = await ensurePngImageUrl(
        supabase,
        sponsor.logo_url,
        `broadcast/${dataOwnerId}/sponsor-${sponsor.id}.png`,
        512,
      );
      // Versiona pela própria logo para o vMix nunca reutilizar imagem antiga em cache.
      const ver = `${sponsor.id.slice(0, 8)}${String(sponsor.logo_url).length}`;
      logoPatrocinador = generated
        ? `${generated.split("?")[0]}?v=${ver}`
        : BLANK_LOGO_URL;
    }

    const empresaLogo = emp?.logo
      ? await ensurePngImageUrl(supabase, emp.logo, `broadcast/${dataOwnerId}/empresa-logo.png`, 512, (emp as any)?.updated_at)
      : "";

    // ── INSERT LIVE scheduling ──
    // 4 inserts mathematically distributed from 07:00 to the LIVE event start time.
    // Each insert displays the event's arte INSERT LIVE (artes_urls[4]) for 30 seconds.
    // Outside those 30s windows, the blank image is shown.
    const IMG_BLANK_URL = "https://zzjfzxxvxbspbdkodoix.supabase.co/storage/v1/object/public/xml-files/broadcast/imgblanck.png";
    let insertLiveUrl = IMG_BLANK_URL;
    const liveEvents = (liveEventsRes.data || []) as any[];
    if (liveEvents.length > 0) {
      // Build map of program id -> horario_inicio for today's LIVE events
      const liveProgIds = liveEvents.map((e) => e.programa_id).filter(Boolean);
      let progTimeMap = new Map<string, string>();
      if (liveProgIds.length > 0) {
        const { data: liveProgs } = await supabase
          .from("programas")
          .select("id, horario_inicio")
          .in("id", liveProgIds);
        progTimeMap = new Map((liveProgs || []).map((p: any) => [p.id, p.horario_inicio]));
      }
      const START_WINDOW = 7 * 3600; // 07:00:00
      const INSERT_COUNT = 4;
      const INSERT_DURATION = 30; // seconds
      for (const ev of liveEvents) {
        const eventStart = timeToSeconds(progTimeMap.get(ev.programa_id) || "");
        if (eventStart <= START_WINDOW) continue;
        const arte = Array.isArray(ev.artes_urls) ? (ev.artes_urls[4] || "").trim() : "";
        if (!arte) continue;
        // Distribute 4 insert start-times evenly across [START_WINDOW, eventStart)
        // Using (i+1)/(N+1) placement so they're balanced and none lands exactly on boundaries.
        const span = eventStart - START_WINDOW;
        for (let i = 0; i < INSERT_COUNT; i++) {
          const insertStart = Math.floor(START_WINDOW + (span * (i + 1)) / (INSERT_COUNT + 1));
          if (nowSeconds >= insertStart && nowSeconds < insertStart + INSERT_DURATION) {
            insertLiveUrl = arte;
            break;
          }
        }
        if (insertLiveUrl !== IMG_BLANK_URL) break;
      }
    }

    // Manual override: "Insert now" button sets insertLiveManualUntil (ISO timestamp)
    const manualUntil = (broadcastConfig as any)?.insertLiveManualUntil;
    if (manualUntil && insertLiveUrl === IMG_BLANK_URL) {
      const untilMs = new Date(manualUntil).getTime();
      if (Number.isFinite(untilMs) && Date.now() < untilMs) {
        // Find any LIVE event today with arte
        for (const ev of liveEvents) {
          const arte = Array.isArray(ev.artes_urls) ? (ev.artes_urls[4] || "").trim() : "";
          if (arte) { insertLiveUrl = arte; break; }
        }
      }
    }

    // Convert INSERT LIVE banner to PNG (vMix/CEF requires .png; source is uploaded as .webp).
    // Use a version derived from the source URL so that swapping the arte busts vMix/CDN cache
    // even though the destination path (insert-live.png) is upserted in place.
    if (insertLiveUrl && insertLiveUrl !== IMG_BLANK_URL) {
      const sourceVersion = String(insertLiveUrl).replace(/[^a-z0-9]/gi, "").slice(-16) || String(Date.now());
      const converted = await ensurePngImageUrl(
        supabase,
        insertLiveUrl,
        `broadcast/${dataOwnerId}/insert-live.png`,
        1920,
        sourceVersion,
      );
      if (converted) insertLiveUrl = converted;
    }
    // ── INFOS CANTO (rotating info tile) ──
    // 5 slots × 5s = 25s cycle:
    //  0-2: Trânsito (3 critical GPS points, 5s each)
    //  3  : Cotação (dólar + euro)
    //  4  : Tempo agora (temperatura + ícone)
    const ICO_CANTO = {
      car:    "https://img.icons8.com/ios-filled/200/ffffff/car.png",
      dollar: "https://img.icons8.com/ios-filled/200/ffffff/us-dollar-circled.png",
      cloud:  "https://img.icons8.com/ios-filled/200/ffffff/cloud.png",
    };
    const BLANK_PNG = "https://zzjfzxxvxbspbdkodoix.supabase.co/storage/v1/object/public/xml-files/broadcast/imgblanck.png";
    const wmoIcon = (code: number): string => {
      const base = "https://img.icons8.com/ios-filled/200/ffffff/";
      if (code === 0 || code === 1) return `${base}sun.png`;
      if (code === 2) return `${base}partly-cloudy-day.png`;
      if (code === 3) return `${base}cloud.png`;
      if (code === 45 || code === 48) return `${base}fog-day.png`;
      if (code >= 51 && code <= 55) return `${base}light-rain.png`;
      if (code >= 61 && code <= 65) return `${base}rain.png`;
      if (code >= 71 && code <= 75) return `${base}snow.png`;
      if (code >= 80 && code <= 82) return `${base}heavy-rain.png`;
      if (code >= 95) return `${base}storm.png`;
      return `${base}cloud.png`;
    };

    const cantoSlot = Math.floor(Date.now() / 5000) % 5;
    let infoCantoTitulo = "";
    let infoCantoDescricao = "";
    let infoCantoIcoCategoria = "";
    let infoCantoTempAtual = "";
    let infoCantoIcoTemp = BLANK_PNG;

    // Always fetch current weather (real-time), independent of rotation slot
    let currentTempStr = "";
    let currentTempIcon = BLANK_PNG;
    try {
      const lat = settingsRes.data?.weather_lat;
      const lon = settingsRes.data?.weather_lon;
      if (lat != null && lon != null) {
        const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&timezone=America/Sao_Paulo&_=${Math.floor(Date.now() / 60000)}`;
        const wxRes = await fetchWithTimeout(wxUrl);
        if (wxRes.ok) {
          const wd = await wxRes.json();
          const t = wd.current?.temperature_2m;
          const code = wd.current?.weather_code;
          if (t != null) currentTempStr = `${Math.round(t)}°`;
          if (typeof code === "number") currentTempIcon = wmoIcon(code);
        }
      }
    } catch { /* silent */ }


    if (cantoSlot <= 2) {
      // Trânsito
      infoCantoTitulo = "trânsito";
      infoCantoIcoCategoria = ICO_CANTO.car;
      infoCantoIcoTemp = BLANK_PNG;
      try {
        const lat = settingsRes.data?.weather_lat;
        const lon = settingsRes.data?.weather_lon;
        if (lat != null && lon != null) {
          const pontos: { via: string; desc: string; score: number }[] = [];

          // 1) Waze Live Map (fallback gratuito, sem chave)
          if (pontos.length === 0) try {

            const d = 0.18;
            const top = lat + d, bottom = lat - d, left = lon - d, right = lon + d;
            const wUrl = `https://www.waze.com/live-map/api/georss?top=${top}&bottom=${bottom}&left=${left}&right=${right}&env=row&types=alerts,traffic`;
            const wRes = await fetchWithTimeout(wUrl, {
              headers: {
                "User-Agent": "Mozilla/5.0 (compatible; NexoHub/1.0)",
                "Referer": "https://www.waze.com/live-map",
                "Accept": "application/json",
              },
            });
            if (wRes.ok) {
              const wData = await wRes.json();
              const jams: any[] = Array.isArray(wData?.jams) ? wData.jams : [];
              const alerts: any[] = Array.isArray(wData?.alerts) ? wData.alerts : [];

              const alertTypeMap: Record<string, string> = {
                ACCIDENT: "acidente",
                JAM: "congestionamento",
                HAZARD: "risco na via",
                ROAD_CLOSED: "via fechada",
                CONSTRUCTION: "obras",
                POLICE: "blitz",
                WEATHERHAZARD: "risco climático",
              };

              for (const j of jams) {
                const via = (j?.street || j?.city || "").toString().trim();
                if (!via) continue;
                const delay = typeof j?.delay === "number" ? j.delay : 0;
                const length = typeof j?.length === "number" ? j.length : 0;
                const speed = typeof j?.speedKMH === "number" ? j.speedKMH : 999;
                // considerar crítico: atraso >= 3min OU extensão >= 800m OU velocidade < 15 km/h
                if (delay >= 180 || length >= 800 || speed < 15) {
                  const mins = Math.round(delay / 60);
                  const km = length >= 1000 ? `${(length / 1000).toFixed(1)} km` : `${length} m`;
                  const desc = `congestionamento — ${km}${mins > 0 ? ` • ~${mins} min de atraso` : ""}`;
                  pontos.push({ via, desc, score: delay * 10 + length });
                }
              }
              for (const a of alerts) {
                const via = (a?.street || a?.city || "").toString().trim();
                if (!via) continue;
                const type = (a?.type || "").toString().toUpperCase();
                const label = alertTypeMap[type] || (a?.subtype ? a.subtype.toString().toLowerCase().replace(/_/g, " ") : "ocorrência");
                // priorizar acidentes/vias fechadas/riscos
                const priority = type === "ACCIDENT" ? 100000 : type === "ROAD_CLOSED" ? 90000 : type === "HAZARD" ? 50000 : type === "CONSTRUCTION" ? 20000 : 0;
                if (priority > 0) {
                  pontos.push({ via, desc: label, score: priority });
                }
              }
              pontos.sort((a, b) => b.score - a.score);
            } else {
              console.warn(`[serve-xml-broadcast] Waze status=${wRes.status}`);
            }
          } catch (e) {
            console.warn("[serve-xml-broadcast] Waze fetch exception", e);
          }

          // 2) TomTom como fallback (se ainda houver crédito na conta)
          if (pontos.length === 0) {
            const tomKey = Deno.env.get("TOMTOM_API_KEY") || "";
            if (tomKey) {
              try {
                const d = 0.22;
                const bbox = `${lon - d},${lat - d},${lon + d},${lat + d}`;
                const fields = "{incidents{properties{iconCategory,magnitudeOfDelay,from,to,length,delay,roadNumbers,events{description}}}}";
                const tUrl = `https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=${encodeURIComponent(bbox)}&fields=${encodeURIComponent(fields)}&language=pt-PT&t=1111&timeValidityFilter=present&key=${tomKey}`;
                const tRes = await fetchWithTimeout(tUrl);
                if (tRes.ok) {
                  const tData = await tRes.json();
                  const incidents: any[] = Array.isArray(tData?.incidents) ? tData.incidents : [];
                  for (const it of incidents) {
                    const p = it?.properties || {};
                    const road = Array.isArray(p.roadNumbers) && p.roadNumbers.length ? p.roadNumbers.join(", ") : "";
                    const evd = Array.isArray(p.events) && p.events[0]?.description ? p.events[0].description : "";
                    let via = road || p.from || p.to || evd || "";
                    if (p.from && p.to && !road) via = `${p.from} → ${p.to}`;
                    if (!via) continue;
                    const delay = typeof p.delay === "number" ? p.delay : 0;
                    pontos.push({ via, desc: evd || "trânsito lento", score: delay });
                  }
                  pontos.sort((a, b) => b.score - a.score);
                }
              } catch (e) {
                console.warn("[serve-xml-broadcast] TomTom fetch exception", e);
              }
            }
          }

          const chosen = pontos[cantoSlot];
          if (chosen) {
            infoCantoDescricao = `${chosen.via} — ${chosen.desc}`;
          }
        }
      } catch (e) { console.warn("[serve-xml-broadcast] traffic block exception", e); }
      if (!infoCantoDescricao) {
        infoCantoDescricao = "trânsito tá de boa agora .... use cinto de segurança!";
      }
    } else if (cantoSlot === 3) {
      // Cotação
      infoCantoTitulo = "cotação";
      infoCantoIcoCategoria = ICO_CANTO.dollar;
      infoCantoIcoTemp = BLANK_PNG;
      const fmt = (v: number) => v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      let usdBrl: number | null = null;
      let eurBrl: number | null = null;
      try {
        const cRes = await fetchWithTimeout("https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL");
        if (cRes.ok) {
          const cd = await cRes.json();
          if (cd?.USDBRL?.bid) usdBrl = parseFloat(cd.USDBRL.bid);
          if (cd?.EURBRL?.bid) eurBrl = parseFloat(cd.EURBRL.bid);
        }
      } catch { /* silent */ }
      // Fallback: open.er-api.com (no key, no quota)
      if (usdBrl == null || eurBrl == null) {
        try {
          const r = await fetchWithTimeout("https://open.er-api.com/v6/latest/USD");
          if (r.ok) {
            const j = await r.json();
            const brl = j?.rates?.BRL;
            const eur = j?.rates?.EUR;
            if (usdBrl == null && typeof brl === "number") usdBrl = brl;
            if (eurBrl == null && typeof brl === "number" && typeof eur === "number" && eur > 0) {
              eurBrl = brl / eur;
            }
          }
        } catch { /* silent */ }
      }
      const linhas: string[] = [];
      if (usdBrl != null) linhas.push(`Dólar R$ ${fmt(usdBrl)}`);
      if (eurBrl != null) linhas.push(`Euro R$ ${fmt(eurBrl)}`);
      infoCantoDescricao = linhas.join("\n");

    } else {
      // Tempo agora — reuse the always-fetched current weather
      infoCantoTitulo = "tempo agora";
      infoCantoIcoCategoria = ICO_CANTO.cloud;
      infoCantoDescricao = "";
      infoCantoTempAtual = currentTempStr;
      infoCantoIcoTemp = currentTempStr ? currentTempIcon : BLANK_PNG;
    }


    // Evaluate at render time (after RSS/weather processing), so the XML never
    // serves text outside the exact 45-second window.
    const aSeguirPulse = resolveBroadcastAseguir(
      progsRes.data || [], new Date(), tz, aSeguirEnabled, manualAseguir,
    );
    const aSeguirNome = aSeguirPulse.t2;
    const aSeguirHorario = aSeguirPulse.t3;
    const aSeguirTexto = aSeguirPulse.t1;
    const aSeguirLogo = "";
    const aSeguirLocutorNome = "";
    const aSeguirLocutorFoto = "";
    const BLANK_PNG_ASEG = "";

    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push("<items>");
    lines.push("  <dados>");
    // Cada requisição lê os dados atuais do banco e informa a hora de geração.
    lines.push(`    <xml_atualizado_em>${new Date().toISOString()}</xml_atualizado_em>`);
    lines.push("    <intervalo_atualizacao>5</intervalo_atualizacao>");

    // O feed tipo=musica é intencionalmente enxuto: não deve expor o
    // conjunto completo de campos do Broadcast, apenas os dados de música.
    if (url.searchParams.get("tipo") === "musica") {
      lines.push(`    <musica_atual>${esc(musicaAtual)}</musica_atual>`);
      lines.push(`    <artista_atual>${esc(artistaAtual)}</artista_atual>`);
      lines.push(`    <musica_capa>${esc(ensurePngExtension(musicaCapa))}</musica_capa>`);
      lines.push(`    <deezer_artist_img>${esc(ensurePngExtension(deezerArtistImg))}</deezer_artist_img>`);
      lines.push(`    <info_music>${esc(curiosidade)}</info_music>`);
      lines.push("  </dados>");
      lines.push("</items>");
      return new Response(lines.join("\n"), {
        headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
      });
    }

    lines.push(`    <empresa_logo>${esc(ensurePngExtension(empresaLogo))}</empresa_logo>`);
    lines.push(`    <programa_nome>${esc(programaNome)}</programa_nome>`);
    lines.push(`    <programa_logo>${esc(ensurePngExtension(programaLogo))}</programa_logo>`);
    lines.push(`    <programa_thumb>${esc(ensurePngExtension(programaThumb))}</programa_thumb>`);
    lines.push(`    <locutor_nome>${esc(locutorNome)}</locutor_nome>`);
    lines.push(`    <locutor_foto>${esc(ensurePngExtension(locutorFoto))}</locutor_foto>`);
    lines.push(`    <locutor_social>${esc(locutorInstagram)}</locutor_social>`);
    lines.push(`    <rede_social_atual>${esc(redeSocialAtual)}</rede_social_atual>`);
    lines.push(`    <rede_social_icone>${esc(redeSocialIcone)}</rede_social_icone>`);
    lines.push(`    <logo_patrocinador>${esc(ensurePngExtension(logoPatrocinador))}</logo_patrocinador>`);
    lines.push(`    <titulo>${esc(assunto)}</titulo>`);
    lines.push(`    <fundo_assunto>${esc(ensurePngExtension(fundoAssunto))}</fundo_assunto>`);
    lines.push(`    <qrcode_link>${esc(qrLink)}</qrcode_link>`);
    lines.push(`    <ticker>${esc(ticker)}</ticker>`);
    lines.push(`    <insert_live>${esc(ensurePngExtension(insertLiveUrl))}</insert_live>`);
    lines.push(`    <curiosidade>${esc(curiosidade)}</curiosidade>`);
    lines.push(`    <musica_atual>${esc(musicaTexto)}</musica_atual>`);
    lines.push(`    <musica_capa>${esc(ensurePngExtension(musicaCapa))}</musica_capa>`);
    lines.push(`    <deezer_artist_img>${esc(ensurePngExtension(deezerArtistImg))}</deezer_artist_img>`);
    lines.push(`    <banner_l>${esc(ensurePngExtension(bannerLUrl))}</banner_l>`);
    lines.push(`    <temperatura>${esc(currentTempStr)}</temperatura>`);
    lines.push(`    <ico_temperatura>${esc(currentTempStr ? ensurePngExtension(currentTempIcon) : "")}</ico_temperatura>`);
    lines.push("    <infos_canto>");
    lines.push(`      <titulo>${esc(infoCantoTitulo)}</titulo>`);
    lines.push(`      <descricao>${esc(infoCantoDescricao)}</descricao>`);
    lines.push(`      <ico_categoria>${esc(ensurePngExtension(infoCantoIcoCategoria))}</ico_categoria>`);
    lines.push(`      <temp_atual>${esc(infoCantoTempAtual || currentTempStr)}</temp_atual>`);
    lines.push(`      <ico_temp_atual>${esc(ensurePngExtension(infoCantoTempAtual ? infoCantoIcoTemp : (currentTempStr ? currentTempIcon : infoCantoIcoTemp)))}</ico_temp_atual>`);
    lines.push("    </infos_canto>");
    // Direct vMix mappings: ALWAYS exist, even when empty.
    lines.push(`    <aseguir_t1>${esc(aSeguirPulse.t1)}</aseguir_t1>`);
    lines.push(`    <aseguir_t2>${esc(aSeguirPulse.t2)}</aseguir_t2>`);
    lines.push(`    <aseguir_t3>${esc(aSeguirPulse.t3)}</aseguir_t3>`);
    // Metadata powers precise local HMD activation/clear without extra polling.
    lines.push(`    <aseguir_expira_em>${esc(aSeguirPulse.expiresAt)}</aseguir_expira_em>`);
    lines.push(`    <aseguir_proximo_disparo_em>${esc(aSeguirPulse.nextTriggerAt)}</aseguir_proximo_disparo_em>`);
    lines.push("    <a_seguir>");
    lines.push(`      <ativo>${aSeguirEnabled ? "1" : "0"}</ativo>`);
    lines.push(`      <programa_nome>${esc(aSeguirNome)}</programa_nome>`);
    lines.push(`      <nome_programa>${esc(aSeguirNome)}</nome_programa>`);
    lines.push(`      <programa_logo>${esc(aSeguirLogo)}</programa_logo>`);
    lines.push(`      <locutor_nome>${esc(aSeguirLocutorNome)}</locutor_nome>`);
    lines.push("      <locutor_foto></locutor_foto>");
    lines.push(`      <horario>${esc(aSeguirHorario)}</horario>`);
    lines.push(`      <texto>${esc(aSeguirTexto)}</texto>`);
    lines.push(`      <intervalo_atualizacao>${aSeguirRefreshSeconds}</intervalo_atualizacao>`);
    lines.push(`      <atualizado_em>${esc(new Date().toISOString())}</atualizado_em>`);
    lines.push("    </a_seguir>");
    lines.push("  </dados>");
    lines.push("</items>");


    return new Response(lines.join("\n"), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "CDN-Cache-Control": "no-store",
        "Surrogate-Control": "no-store",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (err) {
    return new Response(
      `<?xml version="1.0" encoding="UTF-8"?><error>${(err as Error)?.message}</error>`,
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" } }
    );
  }
});