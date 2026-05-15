import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");

const timeToSeconds = (value: string | null | undefined): number => {
  if (!value) return -1;

  const [hours = "0", minutes = "0", seconds = "0"] = value.split(":");
  const total = Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);

  return Number.isFinite(total) ? total : -1;
};

const normalizeDateValue = (value: string | null | undefined): string =>
  (value || "").trim().slice(0, 10);

const resolveDataOwnerId = async (
  supabase: ReturnType<typeof createClient>,
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

const base64ToUint8Array = (dataUrl: string): { data: Uint8Array; contentType: string } => {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL");
  const raw = atob(match[2]);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return { data: arr, contentType: match[1] };
};

const uploadPublicPng = async (
  supabase: ReturnType<typeof createClient>,
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
  supabase: ReturnType<typeof createClient>,
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
  supabase: ReturnType<typeof createClient>,
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
  supabase: ReturnType<typeof createClient>,
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
  if (/\.png$/i.test(cleanUrl)) return withVersion(cleanUrl, version);

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
    const fetchUrl = `https://wsrv.nl/?url=${encodeURIComponent(source)}&output=png&w=${size}&h=${size}&fit=contain`;
    const response = await fetch(fetchUrl);
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
    const supabase = createClient(supabaseUrl, serviceKey);

    const dataOwnerId = await resolveDataOwnerId(supabase, userId);

    const now = new Date();
    const brFormatter = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
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
      timeZone: "America/Sao_Paulo",
      weekday: "long",
    });
    const dateFormatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
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
        .select("logo, instagram, facebook, youtube, site, telefone_participacao, updated_at")
        .eq("user_id", dataOwnerId)
        .maybeSingle(),
      supabase
        .from("programas")
        .select("id, nome, selo, apresentadores_ids, apresentador_id, dias_semana, horario_inicio, horario_fim, variavel, data_variavel, estudio")
        .eq("user_id", dataOwnerId)
        .eq("ativo", true)
        .ilike("estudio", "%fm%"),
      supabase
        .from("roteiros")
        .select("tickertitulos")
        .eq("user_id", dataOwnerId)
        .eq("tipo_programa", "Jornalístico")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
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

    const emp = empRes.data;
    const prog = (progsRes.data || [])
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
      }))
      .filter((entry) => entry.sortKey >= 0)
      .sort((a, b) => b.sortKey - a.sortKey)[0]?.item || null;

    let programaNome = "";
    let programaLogo = "";
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
          locutorFoto = normalizeImageUrl(ap.foto, 1080);
        }
      }
    }

    let sponsorLogos: { nome: string; logo_url: string }[] = [];
    if (programaId) {
      const { data: logos } = await supabase
        .from("logos_patrocinadores")
        .select("nome, logo_url")
        .eq("user_id", dataOwnerId)
        .eq("programa_id", programaId)
        .eq("ativo", true)
        .eq("excluido", false);
      if (logos) sponsorLogos = logos;
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

    const rotationSlot = Math.floor(now.getTime() / 5000);
    let redeSocialAtual = "";
    let redeSocialIcone = "";
    if (socialItems.length > 0) {
      const idx = rotationSlot % socialItems.length;
      redeSocialAtual = socialItems[idx].handle;
      redeSocialIcone = socialItems[idx].icon;
    }

    const qrLink = whatsappDigits ? `https://wa.me/${whatsappDigits}` : "";
    const broadcastConfig = (settingsRes.data?.cenario_config as any)?.broadcast || {};
    const assunto = broadcastConfig.assunto || "";

    // Locutor override: if user defined a custom presenter name in Broadcast,
    // override locutorNome and try to enrich foto/instagram from registered apresentadores.
    const locutorOverride = (broadcastConfig.locutor_override || "").toString().trim();
    if (locutorOverride) {
      locutorNome = locutorOverride;
      const { data: apMatches } = await supabase
        .from("apresentadores")
        .select("nome, instagram, foto")
        .eq("user_id", dataOwnerId)
        .ilike("nome", locutorOverride);
      const ap = (apMatches || [])[0];
      if (ap) {
        locutorInstagram = ap.instagram ? extractHandle(ap.instagram) : "";
        locutorFoto = normalizeImageUrl(ap.foto, 1080);
      } else {
        // No matching presenter — clear instagram/foto so XML doesn't show stale data
        locutorInstagram = "";
        locutorFoto = "";
      }
    }

    const linkedProgIds: string[] = Array.isArray(broadcastConfig.assuntoBgProgramaIds) ? broadcastConfig.assuntoBgProgramaIds : [];
    const bgAppliesToCurrent = linkedProgIds.length === 0 || (programaId && linkedProgIds.includes(programaId));
    const fundoAssunto = broadcastConfig.useCustomAssuntoBg && broadcastConfig.assuntoBgUrl && bgAppliesToCurrent ? broadcastConfig.assuntoBgUrl : "";

    const tickerParts: string[] = [];
    if (broadcastConfig.tickerNews) {
      const titulos = (roteiroRes.data?.tickertitulos || "").trim();
      if (titulos) tickerParts.push(titulos);
    }
    if (broadcastConfig.tickerWeather && settingsRes.data?.weather_lat && settingsRes.data?.weather_lon) {
      try {
        const lat = settingsRes.data.weather_lat;
        const lon = settingsRes.data.weather_lon;
        const wxUrl = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=2&timezone=America/Sao_Paulo`;
        const wxRes = await fetch(wxUrl);
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
    if (broadcastConfig.ticker) tickerParts.push(broadcastConfig.ticker);
    const ticker = tickerParts.join("  •  ");

    // ── Active Promotions / Banners Rotation ──
    // Every 5 seconds, switch between active promotions that have a banner_l_url
    const today = new Date().toISOString().split("T")[0];
    const { data: promoData } = await supabase
      .from("promocoes")
      .select("banner_l_url")
      .eq("user_id", dataOwnerId)
      .lte("data_inicio", today)
      .gte("data_fim", today)
      .not("banner_l_url", "is", null);

    let bannerLUrl = "";
    if (promoData && promoData.length > 0) {
      // Rotate every 5 seconds (using 5-second slots of Unix time)
      const promoSlot = Math.floor(Date.now() / 5000);
      const idx = promoSlot % promoData.length;
      const rawUrl = promoData[idx].banner_l_url;
      if (rawUrl) {
        bannerLUrl = await ensurePngImageUrl(
          supabase,
          rawUrl,
          `broadcast/${dataOwnerId}/promo-banner-l-${idx}.png`,
          1024,
        );
      }
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

    // If no manual override, try the current music curiosity from DB
    if (!curiosidade) {
      const dashboard = settingsRes.data?.dashboard_items as any || {};
      const musicData = dashboard.musicData || {};
      const musicaAtual = musicData.musica || dashboard.music_current_title || "";
      const artistaAtual = musicData.artista || dashboard.music_current_artist || "";
      
      if (musicaAtual && artistaAtual) {
        const { data: info } = await supabase
          .from("infomusic")
          .select("curiosidade")
          .ilike("artista", artistaAtual.trim())
          .ilike("musica", musicaAtual.trim())
          .gt("expires_at", new Date().toISOString())
          .limit(1)
          .maybeSingle();
        
        if (info?.curiosidade) {
          curiosidade = info.curiosidade;
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
      
      if (deezerArtistImgRaw) {
        deezerArtistImg = await ensurePngImageUrl(supabase, deezerArtistImgRaw, `broadcast/${dataOwnerId}/artist-${artistSlug}.png`, 512);
      }
    }
    
    const dashboard = settingsRes.data?.dashboard_items as any || {};
    const musicData = dashboard.musicData || {};
    const musicaAtual = musicData.musica || dashboard.music_current_title || "";
    const artistaAtual = musicData.artista || dashboard.music_current_artist || "";
    const musicaTexto = musicaAtual && artistaAtual ? `${musicaAtual} - ${artistaAtual}` : (musicaAtual || artistaAtual || "");


    const BLANK_LOGO_URL = "https://zzjfzxxvxbspbdkodoix.supabase.co/storage/v1/object/public/xml-files/IMGBLANCK.png";
    let logoPatrocinador = BLANK_LOGO_URL;
    if (sponsorLogos.length > 0) {
      const idx = rotationSlot % sponsorLogos.length;
      const sponsor = sponsorLogos[idx];
      const generated = await ensurePngImageUrl(
        supabase,
        sponsor.logo_url,
        `broadcast/${dataOwnerId}/sponsor-${idx}-${(sponsor.nome || "logo").replace(/[^a-z0-9]/gi, "_").toLowerCase()}.png`,
        512,
      );
      logoPatrocinador = generated || BLANK_LOGO_URL;
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
    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push("<items>");
    lines.push("  <dados>");
    lines.push(`    <empresa_logo>${esc(empresaLogo)}</empresa_logo>`);
    lines.push(`    <programa_nome>${esc(programaNome)}</programa_nome>`);
    lines.push(`    <programa_logo>${esc(programaLogo)}</programa_logo>`);
    lines.push(`    <locutor_nome>${esc(locutorNome)}</locutor_nome>`);
    lines.push(`    <locutor_foto>${esc(locutorFoto)}</locutor_foto>`);
    lines.push(`    <locutor_social>${esc(locutorInstagram)}</locutor_social>`);
    lines.push(`    <rede_social_atual>${esc(redeSocialAtual)}</rede_social_atual>`);
    lines.push(`    <rede_social_icone>${esc(redeSocialIcone)}</rede_social_icone>`);
    lines.push(`    <logo_patrocinador>${esc(logoPatrocinador)}</logo_patrocinador>`);
    lines.push(`    <titulo>${esc(assunto)}</titulo>`);
    lines.push(`    <fundo_assunto>${esc(fundoAssunto)}</fundo_assunto>`);
    lines.push(`    <qrcode_link>${esc(qrLink)}</qrcode_link>`);
    lines.push(`    <ticker>${esc(ticker)}</ticker>`);
    lines.push(`    <insert_live>${esc(insertLiveUrl)}</insert_live>`);
    lines.push(`    <curiosidade>${esc(curiosidade)}</curiosidade>`);
    lines.push(`    <musica_atual>${esc(musicaTexto)}</musica_atual>`);
    lines.push(`    <deezer_artist_img>${esc(deezerArtistImg)}</deezer_artist_img>`);
    lines.push(`    <banner_l>${esc(bannerLUrl)}</banner_l>`);
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
      `<?xml version="1.0" encoding="UTF-8"?><error>${err.message}</error>`,
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/xml; charset=utf-8" } }
    );
  }
});