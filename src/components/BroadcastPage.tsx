import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, Instagram, Globe, MessageCircle, Facebook, Youtube, Phone, Newspaper, CloudSun, Search, Copy, Check, Code2, RefreshCw, Upload, X, Image as ImageIcon, TrendingUp, Clock, Mic, Save } from "lucide-react";
import { useUserSlug } from "@/hooks/useUserSlug";
import { fetchStationDatabaseData, getStationDatabaseSync } from "@/lib/stationDatabaseService";
import { findClientAccountById, findClientAccountByEmail } from "@/lib/clientAuthAccounts";
import { resolveSponsorLogoUrl } from "@/lib/sponsorLogoResolver";



/** Extract @username from a URL or handle string */
function extractHandle(value: string): string {
  const clean = value.trim().replace(/\/+$/, "");
  try {
    const url = new URL(clean.startsWith("http") ? clean : `https://${clean}`);
    const segments = url.pathname.split("/").filter(Boolean);
    if (segments.length > 0) {
      const last = segments[segments.length - 1];
      return `@${last.replace(/^@/, "")}`;
    }
  } catch { /* not a URL */ }
  return `@${clean.replace(/^@/, "")}`;
}

const WMO_LABELS: Record<number, string> = {
  0: "Céu limpo", 1: "Poucas nuvens", 2: "Parcialmente nublado", 3: "Nublado",
  45: "Nevoeiro", 48: "Nevoeiro com geada", 51: "Garoa leve", 53: "Garoa moderada",
  55: "Garoa intensa", 61: "Chuva leve", 63: "Chuva moderada", 65: "Chuva forte",
  71: "Neve leve", 73: "Neve moderada", 75: "Neve forte", 80: "Pancadas leves",
  81: "Pancadas moderadas", 82: "Pancadas fortes", 95: "Trovoadas", 96: "Trovoadas com granizo",
};

interface BroadcastData {
  assunto: string;
  ticker: string;
  locutor_override: string;
  tickerNews: boolean;
  tickerWeather: boolean;
  tickerQuotes: boolean;
  tickerSocials: boolean;
  tickerSocialTypes?: string[];
  tituloMode?: "simples" | "web";
  tickerUnitario: boolean;
  tickerRssEnabled: boolean;
  tickerRssUrl: string;
  tickerNewsRoteiroId?: string;
  showQrCode: boolean;
  assuntoBgUrl: string;
  useCustomAssuntoBg: boolean;
  assuntoBgProgramaIds: string[];
  aSeguirEnabled: boolean;
  aSeguirForceUntil?: string;
  aSeguirLeadSeconds: number;
  aSeguirRefreshSeconds?: number;
  aSeguirLastSentAt?: string;

}

const defaultBroadcast: BroadcastData = {
  assunto: "",
  ticker: "",
  locutor_override: "",
  tickerNews: false,
  tickerWeather: false,
  tickerQuotes: false,
  tickerSocials: false,
  tickerSocialTypes: [],
  tituloMode: "simples",
  tickerUnitario: false,
  tickerRssEnabled: false,
  tickerRssUrl: "",
  tickerNewsRoteiroId: "",
  showQrCode: false,
  assuntoBgUrl: "",
  useCustomAssuntoBg: false,
  assuntoBgProgramaIds: [],
  aSeguirEnabled: false,
  aSeguirForceUntil: "",
  aSeguirLeadSeconds: 300,
  aSeguirRefreshSeconds: 60,
};


// ── helpers for next-program countdown (mirrors serve-xml-broadcast) ──
const DAY_NAME_MAP: Record<string, string> = {
  domingo: "Domingo",
  "segunda-feira": "Segunda",
  "terça-feira": "Terça",
  "quarta-feira": "Quarta",
  "quinta-feira": "Quinta",
  "sexta-feira": "Sexta",
  sábado: "Sábado",
};

function getZonedInfo(date: Date, timezone?: string | null) {
  const fallback = () => ({
    dayName: ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"][date.getDay()],
    dateStr: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
    seconds: date.getHours() * 3600 + date.getMinutes() * 60 + date.getSeconds(),
  });

  if (!timezone) return fallback();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    timezone = "America/Sao_Paulo";
  }

  const dayName = DAY_NAME_MAP[new Intl.DateTimeFormat("pt-BR", { timeZone: timezone, weekday: "long" }).format(date).toLowerCase()] || "Segunda";
  const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }).formatToParts(date);
  const h = Number(parts.find((p) => p.type === "hour")?.value || 0);
  const m = Number(parts.find((p) => p.type === "minute")?.value || 0);
  const s = Number(parts.find((p) => p.type === "second")?.value || 0);
  return { dayName, dateStr, seconds: h * 3600 + m * 60 + s };
}

function timeToSeconds(hhmm: string | null | undefined): number {
  if (!hhmm) return -1;
  const [h = "0", m = "0"] = String(hhmm).split(":");
  const total = Number(h) * 3600 + Number(m) * 60;
  return Number.isFinite(total) ? total : -1;
}

interface NextProgramInfo {
  current: any | null;
  next: any | null;
  nextStartSeconds: number;
  secondsUntilStart: number;
  windowOpenSeconds: number;
  windowCloseSeconds: number;
  actualDurationSeconds: number;
  isInWindow: boolean;
  isForced: boolean;
  forcedRemainingSeconds: number;
}


function computeNextProgramInfo(allProgs: any[], timezone: string | null | undefined, leadSeconds: number, forceUntilIso?: string): NextProgramInfo | null {
  const z = getZonedInfo(new Date(), timezone);
  const now = new Date();
  const nowSeconds = z.seconds;

  const current = allProgs.find((p) => {
    if (p.variavel && p.data_variavel !== z.dateStr) return false;
    if (!p.variavel && !(p.dias_semana || []).includes(z.dayName)) return false;
    const start = timeToSeconds(p.horario_inicio);
    const end = timeToSeconds(p.horario_fim);
    if (start < 0 || end < 0) return false;
    const crosses = end <= start;
    if (!crosses) return nowSeconds >= start && nowSeconds < end;
    return nowSeconds >= start || nowSeconds < end;
  }) || null;

  const curEndSec = current ? timeToSeconds(current.horario_fim) : -1;
  const refSeconds = curEndSec > nowSeconds ? curEndSec : nowSeconds;

  let next: any | null = null;
  let nextStartSeconds = -1;

  for (let offset = 0; offset <= 7; offset++) {
    const refDate = new Date(now.getTime() + offset * 24 * 60 * 60 * 1000);
    const refInfo = getZonedInfo(refDate, timezone);
    const candidates = allProgs
      .map((p) => ({ p, start: timeToSeconds(p.horario_inicio) }))
      .filter(({ p, start }) => {
        if (start < 0) return false;
        if (current && p.id && current.id && p.id === current.id) return false;
        const runs = p.variavel ? p.data_variavel === refInfo.dateStr : (p.dias_semana || []).includes(refInfo.dayName);
        if (!runs) return false;
        return offset > 0 ? true : start >= refSeconds;
      })
      .sort((a, b) => a.start - b.start);

    if (candidates.length > 0) {
      next = candidates[0].p;
      nextStartSeconds = candidates[0].start;
      break;
    }
  }

  if (!next || nextStartSeconds < 0) return null;

  let secondsUntilStart = nextStartSeconds - nowSeconds;
  if (secondsUntilStart < 0) secondsUntilStart += 24 * 60 * 60;

  // A informação permanece no XML até o horário de início do programa.
  const windowOpenSeconds = Math.max(0, secondsUntilStart - leadSeconds);
  const windowCloseSeconds = 0;
  const actualDurationSeconds = leadSeconds;
  const isInWindow = secondsUntilStart <= leadSeconds;
  const isForced = !!forceUntilIso && new Date(forceUntilIso).getTime() > Date.now();
  const forcedRemainingSeconds = isForced
    ? Math.max(0, Math.floor((new Date(forceUntilIso).getTime() - Date.now()) / 1000))
    : 0;

  return { current, next, nextStartSeconds, secondsUntilStart, windowOpenSeconds, windowCloseSeconds, actualDurationSeconds, isInWindow, isForced, forcedRemainingSeconds };

}

function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  if (m > 0) return `${m} min ${String(s).padStart(2, "0")} s`;
  return `${s} s`;
}


interface SocialItem {
  tipo: string;
  valor: string;
  icon: React.ReactNode;
  iconPng?: string;
}

export default function BroadcastPage({ effectiveUserId }: { effectiveUserId?: string | null } = {}) {
  const { user } = useAuth();
  const targetUserId = effectiveUserId || user?.id;
  const acc = (targetUserId && findClientAccountById(targetUserId)) || 
              (targetUserId && findClientAccountByEmail(targetUserId)) || 
              (effectiveUserId && findClientAccountById(effectiveUserId)) ||
              (effectiveUserId && findClientAccountByEmail(effectiveUserId)) ||
              (user?.id && findClientAccountById(user.id)) || 
              (user?.email && findClientAccountByEmail(user?.email));
  const stationUid = acc?.parentUserId || acc?.id || targetUserId || user?.id || "";
  const userSlug = useUserSlug(stationUid);


  const [data, setData] = useState<BroadcastData>(defaultBroadcast);
  const [saving, setSaving] = useState(false);
  const [empresaLogo, setEmpresaLogo] = useState<string | null>(null);
  const [programaLogo, setProgramaLogo] = useState<string | null>(null);
  const [locutorFoto, setLocutorFoto] = useState<string | null>(null);
  const [locutorNome, setLocutorNome] = useState("");
  const [locutoresCadastrados, setLocutoresCadastrados] = useState<{ id: string; nome: string }[]>([]);
  const [locutorCargo, setLocutorCargo] = useState("");
  const [locutorInstagram, setLocutorInstagram] = useState("");
  const [programaNome, setProgramaNome] = useState("");
  const [accentColor, setAccentColor] = useState("#dc2626");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [empresaSocials, setEmpresaSocials] = useState<SocialItem[]>([]);
  const [sponsorLogos, setSponsorLogos] = useState<{nome: string; logo_url: string}[]>([]);
  const [insertLiveArt, setInsertLiveArt] = useState<string>("");
  const [insertLiveSchedule, setInsertLiveSchedule] = useState<string[]>([]);
  const [insertingNow, setInsertingNow] = useState(false);
  const [locutorSearchResults, setLocutorSearchResults] = useState<{nome: string; instagram: string; foto: string | null}[]>([]);
  const [showLocutorDropdown, setShowLocutorDropdown] = useState(false);
  const [allProgramas, setAllProgramas] = useState<{id: string; nome: string}[]>([]);
  const [allProgramasFull, setAllProgramasFull] = useState<any[]>([]);
  const [activeProgramaId, setActiveProgramaId] = useState<string | null>(null);
  const [showProgramDropdown, setShowProgramDropdown] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "titulo" | "insert" | "ticker" | "aseguir">("preview");
  const [videoStreamUrl, setVideoStreamUrl] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState<number>(() => Date.now());
  const [timezone, setTimezone] = useState<string | null>("America/Sao_Paulo");
  const [nextProgramInfo, setNextProgramInfo] = useState<NextProgramInfo | null>(null);
  const latestDataRef = useRef<BroadcastData>(defaultBroadcast);



  // Ticker auto-content
  const [newsTitles, setNewsTitles] = useState<string[]>([]);
  const [roteirosOptions, setRoteirosOptions] = useState<
    { id: string; titulo: string; tipo_programa: string | null; created_at: string; count: number }[]
  >([]);
  const [weatherText, setWeatherText] = useState("");
  const [quotesText, setQuotesText] = useState("");
  const [rssStatus, setRssStatus] = useState<{
    state: "idle" | "loading" | "ok" | "error";
    message?: string;
    via?: string;
    count?: number;
    lastAt?: number;
  }>({ state: "idle" });

  // Broadcast assuntos (from broadcast_assuntos table, per programa)
  const [programaAssuntos, setProgramaAssuntos] = useState<string[]>([]);
  const [programaAssuntoRotation, setProgramaAssuntoRotation] = useState<number>(7);

  useEffect(() => {
    latestDataRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!stationUid) {
      setLocutoresCadastrados([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: presenters, error } = await supabase
        .from("apresentadores")
        .select("id, nome")
        .eq("user_id", stationUid)
        .order("nome", { ascending: true });
      if (!cancelled && !error) {
        setLocutoresCadastrados((presenters || []).filter((p: any) => !!p.nome));
      }
    })();
    return () => { cancelled = true; };
  }, [stationUid]);

  const tituloDefault = `PARTICIPE DA PROGRAMAÇÃO${whatsappNumber ? ` - WHATSAPP: ${whatsappNumber}` : ""}`;

  useEffect(() => {
    if (activeTab === "titulo" && !data.assunto.trim()) {
      setData(prev => prev.assunto.trim() ? prev : { ...prev, assunto: tituloDefault });
    }
  }, [activeTab, tituloDefault, data.assunto]);



  // Auto-sync foto/instagram/cargo whenever locutor_override matches a registered apresentador
  useEffect(() => {
    const nome = (data.locutor_override || "").trim();
    if (!stationUid || nome.length < 2) return;
    const t = setTimeout(async () => {
      const { data: ap } = await supabase
        .from("apresentadores")
        .select("nome, foto, instagram, cargo")
        .eq("user_id", stationUid)
        .ilike("nome", nome)
        .limit(1)
        .maybeSingle();
      if (ap) {
        if (ap.foto) setLocutorFoto(ap.foto);
        if (ap.instagram) setLocutorInstagram(ap.instagram.startsWith("@") ? ap.instagram : `@${ap.instagram}`);
        if (ap.cargo) setLocutorCargo(ap.cargo);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [data.locutor_override, stationUid]);

  // Load data
  const loadInitialData = useCallback(async () => {
    const uid = stationUid;
    if (!uid) return;
    
    let emp: any = null;
    try {
      // Empresa config (logo + socials + timezone + video_stream_api_url)
      const { data: empData } = await supabase
        .from("empresa_config")
        .select("logo, nome, instagram, facebook, youtube, site, telefone_participacao, timezone, video_stream_api_url")
        .eq("user_id", uid)
        .maybeSingle();
      emp = empData;

      if (emp?.logo) setEmpresaLogo(emp.logo);
      if (emp?.timezone) setTimezone(emp.timezone);

      // Build social list from empresa_config
      const socials: SocialItem[] = [];
      if (emp?.instagram) socials.push({ tipo: "instagram", valor: extractHandle(emp.instagram), icon: <Instagram size={11} />, iconPng: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/instagram.png" });
      if (emp?.facebook) socials.push({ tipo: "facebook", valor: extractHandle(emp.facebook), icon: <Facebook size={11} />, iconPng: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/facebook.png" });
      if (emp?.youtube) socials.push({ tipo: "youtube", valor: extractHandle(emp.youtube), icon: <Youtube size={11} />, iconPng: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/youtube.png" });
      if (emp?.site) socials.push({ tipo: "site", valor: extractHandle(emp.site), icon: <Globe size={11} />, iconPng: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/googlechrome.png" });
      if (emp?.telefone_participacao) {
        socials.push({ tipo: "whatsapp", valor: emp.telefone_participacao, icon: <MessageCircle size={11} />, iconPng: "https://cdn.jsdelivr.net/npm/simple-icons@v9/icons/whatsapp.png" });
        setWhatsappNumber(emp.telefone_participacao);
      }
      setEmpresaSocials(socials);
    } catch (e) {
      console.warn("[BroadcastPage] Empresa config load notice:", e);
    }

    try {
      // All programs (for linking assunto background and A Seguir countdown)
      const { data: allProgs } = await supabase
        .from("programas")
        .select("id, nome")
        .eq("user_id", uid)
        .eq("ativo", true)
        .order("nome");
      if (allProgs) setAllProgramas(allProgs);

      const { data: allProgsFull } = await supabase
        .from("programas")
        .select("id, nome, selo, capa, thumb, apresentadores_ids, apresentador_id, dias_semana, horario_inicio, horario_fim, variavel, data_variavel, estudio")
        .eq("user_id", uid)
        .eq("ativo", true);
      if (allProgsFull) setAllProgramasFull(allProgsFull);

      // Current program – match by time AND day of week
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const nowTime = `${hh}:${mm}:00`;
      const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
      const todayName = dayNames[now.getDay()];

      const { data: progs } = await supabase
        .from("programas")
        .select("id, nome, selo, capa, thumb, apresentadores_ids, apresentador_id, dias_semana")
        .eq("user_id", uid)
        .eq("ativo", true)
        .lte("horario_inicio", nowTime)
        .gte("horario_fim", nowTime)
        .contains("dias_semana", [todayName]);

      const prog = progs?.find(() => true);
      if (prog) {
        setActiveProgramaId(prog.id);
        setProgramaNome(prog.nome);
        const logoUrl = prog.selo || null;
        if (logoUrl) setProgramaLogo(logoUrl);

        const apIds = prog.apresentadores_ids || (prog.apresentador_id ? [prog.apresentador_id] : []);
        if (apIds.length > 0) {
          const { data: ap } = await supabase.from("apresentadores").select("nome, foto, instagram, cargo").in("id", apIds).limit(1).maybeSingle();
          if (ap) {
            setLocutorNome(ap.nome);
            if (ap.foto) setLocutorFoto(ap.foto);
            if (ap.instagram) setLocutorInstagram(ap.instagram);
            if (ap.cargo) setLocutorCargo(ap.cargo);
          }
        }

        // Fetch sponsor logos for this program
        let finalLogos: { nome: string; logo_url: string }[] = [];
        try {
          const { data: logos } = await supabase
            .from("logos_patrocinadores")
            .select("nome, logo_url, programa_id, ativo, excluido")
            .eq("user_id", uid)
            .eq("ativo", true)
            .eq("excluido", false);
          if (logos && logos.length > 0) {
            const progLogos = logos.filter(l => !l.programa_id || l.programa_id === prog.id);
            finalLogos.push(...progLogos.map(l => ({ nome: l.nome, logo_url: l.logo_url })));
          }
        } catch (err) {
          console.warn("[BroadcastPage] Logos fetch notice:", err);
        }

        // Merge local storage logos for this station
        try {
          const raw = localStorage.getItem(`nexohub_logos_${uid}`);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
              parsed.forEach((l: any) => {
                if (l.ativo !== false && !l.excluido && (!l.programa_id || l.programa_id === prog.id || l.programa_id === "__none__")) {
                  if (!finalLogos.some(fl => fl.logo_url === l.logo_url)) {
                    finalLogos.push({ nome: l.nome || "", logo_url: l.logo_url });
                  }
                }
              });
            }
          }
        } catch {}

        if (finalLogos.length > 0) {
          setSponsorLogos(finalLogos);
        }
      }
    } catch (e) {
      console.warn("[BroadcastPage] Programas load notice:", e);
    }

    // Video streaming channel resolution for broadcast preview
    let foundVideoUrl: string | null = null;
    const isVideo = (ch: any) => {
      const t = String(ch?.type || "").toLowerCase();
      const u = String(ch?.url || "").toLowerCase();
      return (
        t === "video_live" ||
        t === "video" ||
        t === "tv" ||
        t === "hls" ||
        u.includes(".m3u8") ||
        u.includes("video") ||
        u.includes("youtube.com/live")
      );
    };

    try {
      // 1. Check Supabase streaming_channels
      const { data: dbChannels } = await supabase
        .from("streaming_channels")
        .select("url, type, active, name")
        .eq("user_id", uid)
        .eq("active", true)
        .order("numero_canal", { ascending: true });

      const chVideo = dbChannels?.find(isVideo);
      if (chVideo?.url) {
        foundVideoUrl = chVideo.url.trim();
      }
    } catch {}

    // 2. Fallback to fetchStationDatabaseData and getStationDatabaseSync
    if (!foundVideoUrl) {
      try {
        const station =
          (await fetchStationDatabaseData(userSlug)) ||
          (await fetchStationDatabaseData(user?.email)) ||
          (await fetchStationDatabaseData(uid)) ||
          getStationDatabaseSync(userSlug || user?.email || uid);
        const stVideo = station?.channels?.find((ch: any) => (ch.active ?? true) && isVideo(ch));
        if (stVideo?.url) {
          foundVideoUrl = stVideo.url.trim();
        }
      } catch (err) {
        console.warn("[BroadcastPage] Station database channel fetch notice:", err);
      }
    }

    // 3. Fallback to localStorage
    if (!foundVideoUrl) {
      try {
        const raw = localStorage.getItem(`nexohub_streaming_channels_${uid}`);
        if (raw) {
          const localChannels = JSON.parse(raw);
          const lVideo = Array.isArray(localChannels) ? localChannels.find((ch: any) => (ch.active ?? true) && isVideo(ch)) : null;
          if (lVideo?.url) {
            foundVideoUrl = lVideo.url.trim();
          }
        }
      } catch {}
    }

    // 4. Fallback to empresa_config video_stream_api_url
    if (!foundVideoUrl && (emp as any)?.video_stream_api_url) {
      foundVideoUrl = (emp as any).video_stream_api_url.trim();
    }

    setVideoStreamUrl(foundVideoUrl);
    setReloadKey(Date.now());
  }, [user, targetUserId, userSlug]);

  // Load programa_assuntos (broadcast_assuntos) for active program
  useEffect(() => {
    if (!stationUid || !activeProgramaId) {
      setProgramaAssuntos([]);
      return;
    }
    (async () => {
      const { data: row } = await supabase
        .from("broadcast_assuntos")
        .select("mensagens, mensagens_enabled, rotation_seconds")
        .eq("user_id", stationUid)
        .eq("programa_id", activeProgramaId)
        .maybeSingle();
      if (row) {
        const msgs = (row.mensagens as string[] | null) || [];
        const enabled = (row.mensagens_enabled as boolean[] | null) || [true, true, true];
        const active = msgs.filter((m, i) => m && m.trim() && (enabled[i] ?? true));
        setProgramaAssuntos(active);
        setProgramaAssuntoRotation(row.rotation_seconds || 7);
      } else {
        setProgramaAssuntos([]);
      }
    })();
  }, [stationUid, activeProgramaId]);


  useEffect(() => {
    if (!stationUid) return;
    (async () => {
      await loadInitialData();
      const now = new Date();

      // Fetch today's LIVE event art (artes_urls[4] = INSERT LIVE)
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const { data: liveEvents } = await supabase
        .from("agenda_eventos")
        .select("artes_urls, programa_id")
        .eq("user_id", stationUid)
        .eq("tipo_evento", "live")
        .eq("data", todayStr)
        .limit(1);
      const liveEv = liveEvents?.[0];
      const liveArt = liveEv?.artes_urls?.[4];
      if (liveArt) setInsertLiveArt(liveArt);
      // Compute 4 distributed schedule times between 07:00 and event start
      if (liveEv?.programa_id && liveArt) {
        const { data: progLive } = await supabase
          .from("programas")
          .select("horario_inicio")
          .eq("id", liveEv.programa_id)
          .maybeSingle();
        const hi = progLive?.horario_inicio;
        if (hi) {
          const [h, m] = hi.split(":").map(Number);
          const eventStart = h * 3600 + (m || 0) * 60;
          const START = 7 * 3600;
          if (eventStart > START) {
            const span = eventStart - START;
            const times: string[] = [];
            for (let i = 0; i < 4; i++) {
              const t = Math.floor(START + (span * (i + 1)) / 5);
              const hh = String(Math.floor(t / 3600)).padStart(2, "0");
              const mm = String(Math.floor((t % 3600) / 60)).padStart(2, "0");
              times.push(`${hh}:${mm}`);
            }
            setInsertLiveSchedule(times);
          }
        }
      }
      // Accent color
      const { data: settings } = await supabase.from("user_settings").select("dashboard_items, weather_city, weather_lat, weather_lon").eq("user_id", stationUid).maybeSingle();
      if (settings?.dashboard_items && typeof settings.dashboard_items === "object") {
        const lc = (settings.dashboard_items as any).layout_colors;
        if (lc?.accentColor) setAccentColor(lc.accentColor);
      }

      // Fetch ticker titles from latest journalistic roteiro
      // (skip when a custom RSS source is enabled — that effect owns newsTitles)
      const rssActive = !!(latestDataRef.current?.tickerRssEnabled && latestDataRef.current?.tickerRssUrl);
      if (!rssActive) {
        const parseTitles = (r: any): string[] => {
          if (r?.tickertitulos) {
            return String(r.tickertitulos)
              .split(/\s*[•|]\s*/)
              .map((s: string) => s.trim())
              .filter(Boolean);
          }
          if (r?.conteudo_html) {
            const matches = String(r.conteudo_html).match(/<strong>Notícia\s*\d+:<\/strong>\s*([^<]+)/g);
            if (matches) {
              return matches
                .map((m: string) => m.replace(/<strong>Notícia\s*\d+:<\/strong>\s*/, "").trim())
                .filter(Boolean);
            }
          }
          return [];
        };

        const selectedRoteiroId = latestDataRef.current?.tickerNewsRoteiroId || "";
        if (selectedRoteiroId) {
          const { data: chosen } = await supabase
            .from("roteiros")
            .select("tickertitulos, conteudo_html")
            .eq("id", selectedRoteiroId)
            .maybeSingle();
          setNewsTitles(parseTitles(chosen));
        } else {
          // Sempre o roteiro MAIS RECENTE do usuário (edição mais nova primeiro)
          const { data: rows } = await supabase
            .from("roteiros")
            .select("tickertitulos, conteudo_html, tipo_programa, updated_at, created_at")
            .eq("user_id", stationUid)
            .order("updated_at", { ascending: false, nullsFirst: false })
            .order("created_at", { ascending: false })
            .limit(15);

          let titles: string[] = [];
          for (const r of rows || []) {
            titles = parseTitles(r);
            if (titles.length > 0) break;
          }
          setNewsTitles(titles);
        }
      }


      // Fetch weather
      if (settings?.weather_lat && settings?.weather_lon) {
        try {
          const { data: wxResp } = await supabase.functions.invoke("fetch-weather", {
            body: { action: "forecast", lat: settings.weather_lat, lon: settings.weather_lon, forecast_days: 2 },
          });
          if (wxResp?.ok && wxResp.data) {
            const d = wxResp.data;
            const currentTemp = d.current?.temperature_2m;
            const currentCode = d.current?.weather_code;
            const currentLabel = WMO_LABELS[currentCode] || "—";
            const tomorrow = d.daily;
            let tomorrowPart = "";
            if (tomorrow?.temperature_2m_min?.[1] !== undefined) {
              const tMin = Math.round(tomorrow.temperature_2m_min[1]);
              const tMax = Math.round(tomorrow.temperature_2m_max[1]);
              const tCode = tomorrow.weather_code?.[1];
              const tLabel = WMO_LABELS[tCode] || "—";
              tomorrowPart = ` | Amanhã: ${tMin}°–${tMax}° ${tLabel}`;
            }
            const cityName = settings.weather_city || "";
            setWeatherText(`${cityName ? cityName + ": " : ""}Agora ${Math.round(currentTemp)}° ${currentLabel}${tomorrowPart}`);
          }
        } catch { /* silent */ }
      }

      // Load saved broadcast data
      let loadedConfig: any = null;
      try {
        const { data: us } = await supabase.from("user_settings").select("cenario_config").eq("user_id", stationUid).maybeSingle();
        if (us?.cenario_config && typeof us.cenario_config === "object") {
          loadedConfig = (us.cenario_config as any).broadcast;
        }
      } catch {}

      if (!loadedConfig) {
        try {
          const localSaved =
            localStorage.getItem(`nexohub_broadcast_config_${stationUid}`) ||
            (userSlug ? localStorage.getItem(`nexohub_broadcast_config_${userSlug}`) : null);
          if (localSaved) {
            loadedConfig = JSON.parse(localSaved);
          }
        } catch {}
      }

      if (!loadedConfig) {
        try {
          const resp = await fetch(`/api/sync-broadcast?slug=${encodeURIComponent(userSlug || stationUid)}`);
          if (resp.ok) {
            const json = await resp.json();
            if (json?.data) {
              loadedConfig = json.data;
            }
          }
        } catch {}
      }

      if (loadedConfig) {
        setData((prev) => ({ ...defaultBroadcast, ...prev, ...loadedConfig }));
      }
    })();
  }, [stationUid, userSlug]);

  // Detect program change every 60s — refresh locutor + reset override on switch
  useEffect(() => {
    if (!stationUid) return;
    const refreshActiveProgram = async () => {
      const now = new Date();
      const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:00`;
      const todayName = ["domingo","segunda","terca","quarta","quinta","sexta","sabado"][now.getDay()];
      const { data: progs } = await supabase
        .from("programas")
        .select("id, nome, selo, apresentadores_ids, apresentador_id, dias_semana")
        .eq("user_id", stationUid)
        .eq("ativo", true)
        .lte("horario_inicio", nowTime)
        .gte("horario_fim", nowTime)
        .contains("dias_semana", [todayName]);
      const prog = progs?.find(() => true);
      if (!prog) return;
      // Program changed → reset override and reload presenter
      if (prog.id !== activeProgramaId) {
        setActiveProgramaId(prog.id);
        setProgramaNome(prog.nome);
        if (prog.selo) setProgramaLogo(prog.selo);
        // Reset locutor override so new program's presenter takes over
        setData(prev => ({ ...prev, locutor_override: "" }));
        const apIds = prog.apresentadores_ids || (prog.apresentador_id ? [prog.apresentador_id] : []);
        if (apIds.length > 0) {
          const { data: ap } = await supabase.from("apresentadores").select("nome, foto, instagram, cargo").in("id", apIds).limit(1).maybeSingle();
          if (ap) {
            setLocutorNome(ap.nome);
            setLocutorFoto(ap.foto || null);
            setLocutorInstagram(ap.instagram ? (ap.instagram.startsWith("@") ? ap.instagram : `@${ap.instagram}`) : "");
            setLocutorCargo(ap.cargo || "");
          }
        }
      }
    };
    const interval = setInterval(refreshActiveProgram, 30000);
    const logoRefreshInterval = setInterval(loadInitialData, 30000);
    return () => {
      clearInterval(interval);
      clearInterval(logoRefreshInterval);
    };
  }, [user, activeProgramaId, loadInitialData]);

  // Fetch quotes (currencies + stock indices)
  useEffect(() => {
    if (!data.tickerQuotes) return;
    let cancelled = false;
    const load = async () => {
      try {
        const parts: string[] = [];
        // Currencies USD + EUR via awesomeapi
        try {
          const res = await fetch("https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL");
          if (res.ok) {
            const d = await res.json();
            const usd = d.USDBRL;
            const eur = d.EURBRL;
            const fmtQuote = (label: string, bid: string, pctChange: string) => {
              const val = parseFloat(bid).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 });
              const pctNum = parseFloat(pctChange);
              const sign = pctNum >= 0 ? "▲" : "▼";
              const pct = `${pctNum >= 0 ? "+" : "−"}${Math.abs(pctNum).toFixed(2)}%`;
              return `${label} R$ ${val} ${sign} ${pct}`;
            };
            if (usd) parts.push(fmtQuote("Dólar", usd.bid, usd.pctChange));
            if (eur) parts.push(fmtQuote("Euro",  eur.bid, eur.pctChange));
          }
        } catch { /* silent */ }
        // Stocks removed – only USD and EUR per config

        if (!cancelled) setQuotesText(parts.join(" | "));
      } catch { /* silent */ }
    };
    load();
    const id = setInterval(load, 30 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [data.tickerQuotes]);

  // Fetch news titles from a custom RSS/XML URL when enabled
  useEffect(() => {
    if (!data.tickerRssEnabled || !data.tickerRssUrl) {
      setRssStatus({ state: "idle" });
      return;
    }
    let cancelled = false;
    const load = async () => {
      setRssStatus(s => ({ ...s, state: "loading" }));
      try {
        const { data: resp, error } = await supabase.functions.invoke("fetch-rss-titles", {
          body: { url: data.tickerRssUrl },
        });
        if (cancelled) return;
        if (error) {
          setRssStatus({ state: "error", message: error.message || "Erro ao consultar a função.", lastAt: Date.now() });
          return;
        }
        // Use any titles we managed to fetch, even if the function also reports a partial error
        if (resp && Array.isArray(resp.titles) && resp.titles.length > 0) {
          setNewsTitles(resp.titles);
          setRssStatus({ state: "ok", via: resp.via, count: resp.titles.length, lastAt: Date.now() });
        } else {
          setRssStatus({
            state: "error",
            message: resp?.error || "Nenhum título encontrado no feed.",
            via: resp?.via,
            lastAt: Date.now(),
          });
        }
      } catch (e: any) {
        if (cancelled) return;
        setRssStatus({ state: "error", message: e?.message || "Falha ao conectar.", lastAt: Date.now() });
      }
    };
    load();
    const id = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [data.tickerRssEnabled, data.tickerRssUrl]);

  // Redes sociais selecionadas para o ticker (vazio = todas)
  // Lista de roteiros disponíveis para escolher a fonte das notícias do ticker
  useEffect(() => {
    (async () => {
      const targetId = stationUid || user?.id;
      if (!targetId) return;
      const { data: rows } = await supabase
        .from("roteiros")
        .select("id, programa_nome, tipo_programa, data_programa, created_at, tickertitulos")
        .eq("user_id", targetId)
        .order("created_at", { ascending: false })
        .limit(40);
      setRoteirosOptions(
        (rows || []).map((r: any) => ({
          id: r.id,
          titulo: r.programa_nome || "Roteiro sem nome",
          tipo_programa: r.tipo_programa || null,
          created_at: r.data_programa || r.created_at,
          count: r.tickertitulos
            ? String(r.tickertitulos).split(/\s*[•|]\s*/).map((t: string) => t.trim()).filter(Boolean).length
            : 0,
        }))
      );
    })();
  }, []);

  const selectedSocialTypes = useMemo(() => {
    const sel = data.tickerSocialTypes;
    if (!sel || sel.length === 0) return empresaSocials.map(s => s.tipo);
    return sel;
  }, [data.tickerSocialTypes, empresaSocials]);

  const tickerSocialItems = useMemo(
    () => empresaSocials.filter(s => selectedSocialTypes.includes(s.tipo)),
    [empresaSocials, selectedSocialTypes],
  );

  // Lista de todos os textos ativos no ticker (para preview)
  const tickerItems = useMemo(() => {
    const items: { source: string; text: string }[] = [];
    if (data.tickerNews) newsTitles.forEach(t => items.push({ source: "Notícia", text: t }));
    if (data.tickerWeather && weatherText) items.push({ source: "Tempo", text: weatherText });
    if (data.tickerQuotes && quotesText) items.push({ source: "Cotação", text: quotesText });
    if (data.tickerSocials) tickerSocialItems.forEach(s => items.push({ source: s.tipo, text: s.valor }));
    if (data.ticker.trim()) items.push({ source: "Livre", text: data.ticker.trim() });
    return items;
  }, [data.tickerNews, data.tickerWeather, data.tickerQuotes, data.tickerSocials, data.ticker, newsTitles, weatherText, quotesText, tickerSocialItems]);

  // Compose ticker from sources
  const composedTicker = useMemo(() => {
    const parts: string[] = [];
    if (data.tickerNews && newsTitles.length > 0) {
      parts.push(newsTitles.join("  •  "));
    }
    if (data.tickerWeather && weatherText) {
      parts.push(weatherText);
    }
    if (data.tickerQuotes && quotesText) {
      parts.push(quotesText);
    }
    if (data.tickerSocials && tickerSocialItems.length > 0) {
      const labels: Record<string, string> = {
        instagram: "Instagram",
        facebook: "Facebook",
        youtube: "YouTube",
        site: "Site",
        whatsapp: "WhatsApp",
      };
      parts.push(
        tickerSocialItems
          .map(s => `${labels[s.tipo] || s.tipo}: ${s.valor}`)
          .join("  •  ")
      );
    }
    if (data.ticker) {
      parts.push(data.ticker);
    }
    return parts.join("  •  ");
  }, [data.tickerNews, data.tickerWeather, data.tickerQuotes, data.tickerSocials, data.ticker, newsTitles, weatherText, quotesText, tickerSocialItems]);

  const displayLocutor = data.locutor_override || locutorNome || "Locutor";

  // Generate XML content
  const escXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

  const effectiveAssuntoBgUrl = useMemo(() => {
    if (!data.useCustomAssuntoBg || !data.assuntoBgUrl) return "";
    const linked = data.assuntoBgProgramaIds || [];
    // If no programs linked, apply globally; otherwise only when current program is in the linked list
    if (linked.length === 0) return data.assuntoBgUrl;
    if (activeProgramaId && linked.includes(activeProgramaId)) return data.assuntoBgUrl;
    return "";
  }, [data.useCustomAssuntoBg, data.assuntoBgUrl, data.assuntoBgProgramaIds, activeProgramaId]);

  const broadcastXml = useMemo(() => {
    const lines: string[] = [];
    lines.push('<?xml version="1.0" encoding="UTF-8"?>');
    lines.push("<broadcast>");
    lines.push(`  <titulo>${escXml(data.assunto || "")}</titulo>`);
    lines.push(`  <fundo_assunto>${escXml(effectiveAssuntoBgUrl)}</fundo_assunto>`);
    lines.push("  <programa>");
    lines.push(`    <nome>${escXml(programaNome || "")}</nome>`);
    lines.push(`    <logo_url>${escXml(programaLogo || "")}</logo_url>`);
    lines.push("  </programa>");
    lines.push("  <locutor>");
    lines.push(`    <nome>${escXml(displayLocutor)}</nome>`);
    lines.push(`    <rede_social>${escXml(locutorInstagram || "")}</rede_social>`);
    lines.push("  </locutor>");
    lines.push("  <redes_sociais>");
    empresaSocials.forEach(s => {
      lines.push(`    <item>`);
      lines.push(`      <icone>${escXml(s.iconPng || s.tipo + ".png")}</icone>`);
      lines.push(`      <texto>${escXml(s.valor)}</texto>`);
      lines.push(`    </item>`);
    });
    lines.push("  </redes_sociais>");
    lines.push("  <logos_patrocinadores>");
    sponsorLogos.forEach(l => {
      lines.push("    <logo>");
      lines.push(`      <nome>${escXml(l.nome)}</nome>`);
      lines.push(`      <url>${escXml(resolveSponsorLogoUrl(l.logo_url, l.nome))}</url>`);
      lines.push("    </logo>");
    });
    lines.push("  </logos_patrocinadores>");
    const qrLink = whatsappNumber ? `https://wa.me/${whatsappNumber.replace(/\D/g, "")}` : "";
    lines.push(`  <qrcode_link>${escXml(qrLink)}</qrcode_link>`);
    lines.push(`  <ticker>${escXml(composedTicker)}</ticker>`);
    lines.push("</broadcast>");
    return lines.join("\n");
  }, [data.assunto, displayLocutor, locutorInstagram, empresaSocials, data.showQrCode, whatsappNumber, composedTicker, programaNome, programaLogo, sponsorLogos]);

  const handleSave = useCallback(async (payload?: BroadcastData) => {
    if (!stationUid) return;
    setSaving(true);
    const toastId = toast("Atualizando XML...", { icon: <RefreshCw size={14} className="animate-spin" /> });
    try {
      const nextData = payload || latestDataRef.current;

      // 1. Save locally for instant persistence
      try {
        localStorage.setItem(`nexohub_broadcast_config_${stationUid}`, JSON.stringify(nextData));
        if (userSlug) {
          localStorage.setItem(`nexohub_broadcast_config_${userSlug}`, JSON.stringify(nextData));
        }
      } catch {}

      // 2. Synchronize with Vite server for real-time XML regeneration
      try {
        await fetch("/api/sync-broadcast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            slug: userSlug || stationUid,
            stationUid,
            data: nextData,
          }),
        });
      } catch {}

      // 3. Persist to Supabase if reachable
      try {
        const { data: current } = await supabase.from("user_settings").select("cenario_config").eq("user_id", stationUid).maybeSingle();
        const existing = (current?.cenario_config && typeof current.cenario_config === "object") ? current.cenario_config as Record<string, any> : {};
        
        await supabase.from("user_settings").update({
          cenario_config: { ...existing, broadcast: nextData } as any,
        }).eq("user_id", stationUid);
      } catch {}

      toast.success("XML atualizado!", { id: toastId });
    } catch {
      toast.error("Erro ao salvar", { id: toastId });
    }
    setSaving(false);
  }, [stationUid, userSlug]);

  const onFieldBlur = useCallback(() => {
    handleSave();
  }, [handleSave]);

  // ── Atualização automática do ticker no XML a cada 5 minutos ──
  // Recarrega as fontes (notícias/tempo/cotações) e regrava a config no
  // backend em silêncio, para o XML do vMix sempre servir texto atualizado.
  const [tickerSyncedAt, setTickerSyncedAt] = useState<Date | null>(null);
  useEffect(() => {
    if (!stationUid) return;
    const syncTicker = async () => {
      try {
        await loadInitialData();
        const { data: cur } = await supabase
          .from("user_settings")
          .select("cenario_config")
          .eq("user_id", stationUid)
          .maybeSingle();
        const existing = (cur?.cenario_config && typeof cur.cenario_config === "object")
          ? cur.cenario_config as Record<string, any>
          : {};
        const broadcast = {
          ...(existing.broadcast || {}),
          ...latestDataRef.current,
          tickerUpdatedAt: new Date().toISOString(),
        };
        await supabase
          .from("user_settings")
          .update({ cenario_config: { ...existing, broadcast } as any })
          .eq("user_id", stationUid);
        setTickerSyncedAt(new Date());
      } catch {
        /* silencioso — próxima janela de 5min tenta de novo */
      }
    };
    void syncTicker();
    const id = setInterval(syncTicker, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [stationUid, loadInitialData]);

  // ── Módulo A SEGUIR: envio contínuo em backend ──
  // Quando habilitado, o XML é regerado no backend (serve-xml-broadcast
  // calcula o próximo programa da grade a cada requisição) no intervalo
  // escolhido pelo usuário. Aqui apenas disparamos o refresh periódico e
  // registramos o último envio para o usuário acompanhar.
  const [aSeguirSentAt, setASeguirSentAt] = useState<Date | null>(null);
  useEffect(() => {
    if (!stationUid || !data.aSeguirEnabled) return;
    const every = Math.max(15, Number(data.aSeguirRefreshSeconds) || 60) * 1000;
    let cancelled = false;
    const push = async () => {
      try {
        const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-xml-broadcast?user_id=${stationUid}&aseguir=1&t=${Date.now()}`;
        await fetch(url, { cache: "no-store" });
        if (!cancelled) setASeguirSentAt(new Date());
      } catch {
        /* silencioso — próximo ciclo tenta de novo */
      }
    };
    void push();
    const timer = setInterval(push, every);
    return () => { cancelled = true; clearInterval(timer); };
  }, [stationUid, data.aSeguirEnabled, data.aSeguirRefreshSeconds]);




  const handleInsertNow = useCallback(async () => {
    if (!stationUid || !insertLiveArt) return;
    setInsertingNow(true);
    try {
      const { data: cur } = await supabase.from("user_settings").select("cenario_config").eq("user_id", stationUid).maybeSingle();
      const existing = (cur?.cenario_config && typeof cur.cenario_config === "object") ? cur.cenario_config as Record<string, any> : {};
      const broadcast = { ...(existing.broadcast || {}), insertLiveManualUntil: new Date(Date.now() + 30_000).toISOString() };
      await supabase.from("user_settings").update({ cenario_config: { ...existing, broadcast } as any }).eq("user_id", stationUid);
      toast.success("Insert Live ativo por 30 segundos!");
      setTimeout(() => setInsertingNow(false), 30_000);
    } catch {
      toast.error("Erro ao inserir");
      setInsertingNow(false);
    }
  }, [stationUid, insertLiveArt]);

  const [uploadingBg, setUploadingBg] = useState(false);
  const handleBgUpload = useCallback(async (file: File) => {
    if (!stationUid || !file) return;
    if (file.type !== "image/png") {
      toast.error("A imagem deve ser .png");
      return;
    }
    setUploadingBg(true);
    try {
      const path = `broadcast/${stationUid}/assunto-bg-${Date.now()}.png`;
      const { error } = await supabase.storage
        .from("empresa-assets")
        .upload(path, file, { upsert: true, contentType: "image/png", cacheControl: "3600" });
      if (error) throw error;
      const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(path);
      const url = `${urlData.publicUrl}?t=${Date.now()}`;
      const next = { ...latestDataRef.current, assuntoBgUrl: url, useCustomAssuntoBg: true };
      setData(next);
      await handleSave(next);
      toast.success("Fundo do assunto atualizado!");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao enviar imagem");
    }
    setUploadingBg(false);
  }, [user, handleSave]);

  const removeBgImage = useCallback(() => {
    const next = { ...latestDataRef.current, assuntoBgUrl: "", useCustomAssuntoBg: false };
    setData(next);
    void handleSave(next);
  }, [handleSave]);

  const NAVY = "#002132";
  const NAVY_DEEP = "#ffffff";
  const NAVY_SOFT = "#f8fafc";
  const NAVY_BORDER = "rgba(226, 232, 240, 0.9)";
  const CYAN = "#0055ff";
  const LIME = "#0055ff";

  const inputStyle: React.CSSProperties = {
    backgroundColor: "#f8fafc",
    border: `1px solid ${NAVY_BORDER}`,
    color: "#0f172a",
    outline: "none",
    fontFamily: "'Montserrat', sans-serif",
    borderRadius: 999,
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: "#ffffff",
    border: `1px solid ${NAVY_BORDER}`,
    borderRadius: 24,
    boxShadow: "0 4px 24px rgba(0, 0, 0, 0.03)",
  };

  const sectionHeaderStyle: React.CSSProperties = {
    fontFamily: "'Sora', sans-serif",
    fontWeight: 700,
    letterSpacing: "0.14em",
    color: "#002132",
  };

  // Load Sora + Manrope once
  useEffect(() => {
    const id = "broadcast-fonts-sora-manrope";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Sora:wght@400;600;700;800&display=swap";
    document.head.appendChild(link);
  }, []);

  // A Seguir countdown
  useEffect(() => {
    if (!user) return;
    const tick = () => {
      if (allProgramasFull.length === 0) return;
      const info = computeNextProgramInfo(
        allProgramasFull,
        timezone,
        Number(data.aSeguirLeadSeconds) || 300,
        data.aSeguirForceUntil,
      );
      setNextProgramInfo(info);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [user, allProgramasFull, timezone, data.aSeguirLeadSeconds, data.aSeguirForceUntil]);

  // A Seguir — locutor do próximo programa (para a prévia do XML)
  const [aSeguirLocutor, setASeguirLocutor] = useState<{ nome: string; foto: string } | null>(null);
  const nextProgId = nextProgramInfo?.next?.id || null;
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const prog = nextProgramInfo?.next;
      if (!user || !prog) { setASeguirLocutor(null); return; }
      const apIds: string[] = (prog.apresentadores_ids && prog.apresentadores_ids.length > 0)
        ? prog.apresentadores_ids
        : (prog.apresentador_id ? [prog.apresentador_id] : []);
      if (apIds.length === 0) { setASeguirLocutor(null); return; }
      const { data: aps } = await supabase
        .from("apresentadores")
        .select("id, nome, foto")
        .in("id", apIds);
      if (cancelled) return;
      const ap = (aps || []).sort((a: any, b: any) => apIds.indexOf(a.id) - apIds.indexOf(b.id))[0];
      setASeguirLocutor(ap ? { nome: ap.nome || "", foto: ap.foto || "" } : null);
    })();
    return () => { cancelled = true; };
  }, [user, nextProgId]);

  const BLANK_PNG_ASEGUIR = "https://zzjfzxxvxbspbdkodoix.supabase.co/storage/v1/object/public/xml-files/broadcast/imgblanck.png";
  const aSeguirActive = !!data.aSeguirEnabled && !!nextProgramInfo && (nextProgramInfo.isInWindow || nextProgramInfo.isForced);
  const aSeguirXmlPreview = (() => {
    const horario = aSeguirActive ? (nextProgramInfo?.next?.horario_inicio || "").toString().slice(0, 5) : "";
    return {
      ativo: data.aSeguirEnabled ? "1" : "0",
      programa_nome: aSeguirActive ? (nextProgramInfo?.next?.nome || "") : "",
      programa_logo: aSeguirActive ? (nextProgramInfo?.next?.selo || BLANK_PNG_ASEGUIR) : BLANK_PNG_ASEGUIR,
      locutor_nome: aSeguirActive ? (aSeguirLocutor?.nome || "") : "",
      locutor_foto: aSeguirActive ? (aSeguirLocutor?.foto || BLANK_PNG_ASEGUIR) : BLANK_PNG_ASEGUIR,
      horario,
      texto: horario ? `começa às: ${horario}` : "",
    };
  })();


  const SectionHeader = ({ n, label, color = CYAN, right }: { n: string; label: string; color?: string; right?: React.ReactNode }) => (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <span
          className="inline-flex items-center justify-center rounded-md text-[10px] font-black"
          style={{ width: 22, height: 22, backgroundColor: color, color: "#ffffff", fontFamily: "'Sora', sans-serif" }}
        >
          {n}
        </span>
        <h2 className="text-[#002132] text-[11px] uppercase font-bold tracking-wider" style={sectionHeaderStyle}>{label}</h2>
      </div>
      {right}
    </div>
  );

  return (
    <div
      className="px-3 pt-3 pb-4 h-full min-h-0"
      style={{ fontFamily: "'Manrope', sans-serif", backgroundColor: "transparent" }}
    >
      <div className="w-full max-w-6xl mx-auto h-full min-h-0 flex flex-col gap-4">
        {/* Header handled by Dashboard Portal */}
        <div id="module-header-title" style={{ display: "none" }}>
          vMix — Broadcast
        </div>

        {/* ── Command bar (slim, clean) ── */}
        <div
          className="flex items-center justify-between gap-4 px-4 h-14 rounded-xl shrink-0 bg-white"
          style={{ border: `1px solid ${NAVY_BORDER}` }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${CYAN}15` }}>
              <Code2 size={16} style={{ color: CYAN }} />
            </div>
            <div className="min-w-0 leading-tight">
              <div className="text-slate-800 text-[13px] font-bold tracking-[0.12em] uppercase" style={{ fontFamily: "'Sora', sans-serif" }}>
                Broadcast
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: programaNome ? "#22c55e" : "#94a3b8" }}
                />
                <span className="text-[10px] font-semibold uppercase tracking-wider truncate text-slate-500">
                  {programaNome || "Sem programa no ar"}
                </span>
              </div>
            </div>
          </div>

          {saving && (
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-400 shrink-0">
              <RefreshCw size={12} className="animate-spin text-[#0055ff]" />
              <span>Salvando...</span>
            </div>
          )}
        </div>

        {/* ── Navigation (segmented, always labelled) ── */}
        <div className="flex items-center gap-1 p-1 rounded-xl shrink-0 overflow-x-auto bg-white" style={{ border: `1px solid ${NAVY_BORDER}` }}>
          {(["preview", "titulo", "insert", "ticker", "aseguir"] as const).map(tabId => {
            const active = activeTab === tabId;
            const labels: Record<string, string> = { preview: "Ao Vivo", titulo: "Título", insert: "Insert", ticker: "Ticker", aseguir: "A Seguir" };
            const Icons: Record<string, any> = { preview: ImageIcon, titulo: Mic, insert: Youtube, ticker: TrendingUp, aseguir: Clock };
            const Icon = Icons[tabId];
            return (
              <button
                key={tabId}
                onClick={() => {
                  if (tabId === "preview") {
                    setReloadKey(Date.now());
                  }
                  setActiveTab(tabId);
                }}
                className="flex items-center justify-center gap-2 flex-1 min-w-[104px] h-9 rounded-lg text-[10px] font-bold uppercase tracking-[0.14em] transition-colors cursor-pointer"
                style={{
                  backgroundColor: active ? CYAN : "transparent",
                  color: active ? "#ffffff" : "#64748b",
                  fontFamily: "'Sora', sans-serif",
                }}
              >
                <Icon size={13} />
                {labels[tabId]}
              </button>
            );
          })}
        </div>




        {/* ── Tab panels ── */}
        <div className={`flex-1 min-h-0 ${activeTab === "preview" ? "overflow-hidden flex items-center justify-center py-2" : "overflow-y-auto pr-1 pb-10"}`}>

        {activeTab === "preview" && (
        <div 
          className="w-full mx-auto flex flex-col items-center justify-center gap-3 min-h-0 py-1"
          style={{ 
            maxWidth: "min(600px, calc((100vh - 410px) * 16 / 9))",
            width: "100%"
          }}
        >
            {/* 16:9 preview stage with Tally Border */}
            <div 
              className="w-full relative rounded-2xl overflow-hidden group transition-all duration-500"
              style={{ 
                backgroundColor: "#000",
                border: `6px solid ${insertLiveArt ? "#dc2626" : NAVY_BORDER}`,
                boxShadow: insertLiveArt 
                  ? "0 0 60px rgba(220,38,38,0.25), 0 20px 80px rgba(0,0,0,0.8)" 
                  : "0 30px 100px -20px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.05)"
              }}
            >

              <div 
                className="relative overflow-hidden" 
                style={{ 
                  width: "100%", 
                  aspectRatio: "16/9",
                  border: `4px solid ${insertingNow ? '#ef4444' : '#ffffff08'}`,
                  transition: 'border-color 0.3s ease',
                  boxShadow: insertingNow ? '0 0 40px rgba(239, 68, 68, 0.2)' : 'none'
                }}
              >
                <MockupPreview
                  empresaLogo={empresaLogo}
                  programaNome={programaNome}
                  programaLogo={programaLogo}
                  displayLocutor={displayLocutor}
                  locutorInstagram={locutorInstagram}
                  locutorFoto={locutorFoto}
                  accentColor={accentColor}
                  assunto={data.assunto}
                  showQrCode={data.showQrCode}
                  whatsappNumber={whatsappNumber}
                  empresaSocials={empresaSocials}
                  composedTicker={composedTicker}
                  sponsorLogos={sponsorLogos}
                  assuntoBgUrl={effectiveAssuntoBgUrl}
                  insertLiveArt={insertLiveArt}
                  programaAssuntos={programaAssuntos}
                  programaAssuntoRotation={programaAssuntoRotation}
                  videoStreamUrl={videoStreamUrl}
                  reloadKey={reloadKey}
                />
                
                {/* Floating Status HUD (Master badge removed as requested) */}
                {insertingNow && (
                  <div className="absolute top-4 left-4 flex gap-2 pointer-events-none z-20">
                    <div className="px-3 py-1.5 rounded-lg bg-[#ef4444]/90 backdrop-blur-md border border-white/20 flex items-center gap-2 shadow-lg">
                      <Youtube size={12} className="text-white" />
                      <span className="text-[10px] font-black text-white uppercase tracking-widest">LIVE ACTIVE</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
        </div>
        )}

        {activeTab === "insert" && (
          <div className="max-w-3xl mx-auto flex flex-col gap-6 w-full">
            {/* Robust Control Bento */}
            <div 
              className="p-6 rounded-2xl flex flex-col gap-5 bg-white" 
              style={{ 
                ...cardStyle, 
                border: `1px solid ${NAVY_BORDER}`, 
                boxShadow: "0 4px 20px rgba(0,0,0,0.04)"
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${CYAN}15` }}>
                    <TrendingUp size={16} style={{ color: CYAN }} />
                  </div>
                  <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-800" style={{ fontFamily: "'Sora', sans-serif" }}>
                    Painel de Controle
                  </span>
                </div>
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-50 border border-green-200">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                  <span className="text-[9px] font-black text-green-700 uppercase">Online</span>
                </div>
              </div>

              {insertLiveArt ? (
                <div className="flex flex-col gap-4">
                  {/* Imagem que será enviada no insert */}
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.15em] mb-2 text-slate-600">Imagem do Insert Live</div>
                    <div className="rounded-xl overflow-hidden bg-slate-50 border border-slate-200 p-2">
                      <img src={insertLiveArt} alt="Insert Live" className="w-full max-h-56 object-contain" />
                    </div>
                  </div>

                  {/* Horários programados */}
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.15em] mb-2 text-slate-600">Horários de Inserção Automática</div>
                    {insertLiveSchedule.length === 0 ? (
                      <p className="text-[11px] text-slate-400 italic">Sem horários calculados para hoje.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {insertLiveSchedule.map(t => (
                          <span
                            key={t}
                            className="px-3 py-1.5 rounded-lg text-[12px] font-bold tabular-nums"
                            style={{ backgroundColor: `${CYAN}12`, border: `1px solid ${CYAN}35`, color: CYAN }}
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={handleInsertNow}
                    disabled={insertingNow}
                    className="w-full py-3.5 rounded-2xl text-[12px] font-black uppercase tracking-[0.15em] flex items-center justify-center gap-3 transition-all hover:brightness-110 active:scale-[0.98] shadow-md cursor-pointer"
                    style={{ backgroundColor: "#dc2626", color: "#fff", boxShadow: "0 8px 20px rgba(220,38,38,0.25)" }}
                  >
                    <Youtube size={16} />
                    {insertingNow ? "Live Ativa (30s)" : "Inserir Agora (Manual)"}
                  </button>
                </div>
              ) : (
                <p className="text-[11px] text-slate-500 italic">
                  Nenhuma imagem de Insert Live cadastrada para hoje (arte 5 do evento de live na agenda).
                </p>
              )}

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Sincronização Ativa</span>
                <div className="flex gap-1">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="w-1.5 h-3 rounded-full bg-[#0055ff]" />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === "titulo" && (
          <div className="max-w-3xl mx-auto flex flex-col gap-5 w-full">
            <div className="p-6 rounded-2xl flex flex-col gap-4 bg-white" style={{ ...cardStyle, border: `1px solid ${NAVY_BORDER}` }}>
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-600">Assunto / Título no ar</span>
                <input
                  value={data.assunto}
                  onChange={e => setData(prev => ({ ...prev, assunto: e.target.value }))}
                  className="h-10 px-3 rounded-lg border border-slate-200 text-sm font-bold"
                  placeholder={tituloDefault}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-600">Locutor</span>
                <select
                  value={data.locutor_override || locutorNome || ""}
                  onChange={e => setData(prev => ({ ...prev, locutor_override: e.target.value }))}
                  className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm"
                >
                  <option value="">Locutor do programa</option>
                  {locutoresCadastrados.map((locutor) => (
                    <option key={locutor.id} value={locutor.nome}>{locutor.nome}</option>
                  ))}
                </select>
              </label>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setData(prev => ({ ...prev, assunto: tituloDefault }))}
                  className="flex items-center justify-center gap-2 px-4 h-10 rounded-full border border-slate-200 text-[10px] font-black uppercase tracking-[0.12em] text-slate-600 hover:bg-slate-50"
                >
                  Voltar ao título padrão
                </button>
                <button
                  onClick={() => handleSave({ ...data })}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 h-10 rounded-full text-[11px] font-black uppercase tracking-[0.15em] cursor-pointer"
                  style={{ backgroundColor: CYAN, color: "#fff" }}
                >
                  <Save size={14} /> Salvar título
                </button>
              </div>
            </div>
          </div>
        )}


        {activeTab === "ticker" && (
          <div className="max-w-3xl mx-auto p-6 rounded-2xl" style={cardStyle}>
            <SectionHeader n="02" label="Ticker System" color={CYAN} />

            {/* Fonte RSS/XML personalizada */}
            <div
              className="p-4 rounded-xl mb-3"
              style={{
                backgroundColor: data.tickerRssEnabled ? "rgba(0,85,255,0.06)" : "#f8fafc",
                border: `1px solid ${data.tickerRssEnabled ? CYAN : NAVY_BORDER}`,
              }}
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <span className="text-[12px] font-bold text-slate-800 block">Fonte RSS / XML personalizada</span>
                  <p className="text-[10px] text-slate-500">
                    Cole a URL de um feed RSS/XML — os títulos alimentam o item "Notícias" do ticker.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 cursor-pointer shrink-0">
                  <input
                    type="checkbox"
                    checked={data.tickerRssEnabled}
                    onChange={e => {
                      const nextData = { ...latestDataRef.current, tickerRssEnabled: e.target.checked };
                      setData(nextData);
                      void handleSave(nextData);
                    }}
                    style={{ accentColor: CYAN }}
                  />
                  <span className="text-[11px] font-medium" style={{ color: data.tickerRssEnabled ? CYAN : "#64748b" }}>
                    {data.tickerRssEnabled ? "Ligado" : "Desligado"}
                  </span>
                </label>
              </div>
              <input
                type="url"
                value={data.tickerRssUrl}
                onChange={e => setData({ ...data, tickerRssUrl: e.target.value })}
                onBlur={onFieldBlur}
                placeholder="https://exemplo.com/feed.xml"
                disabled={!data.tickerRssEnabled}
                className="w-full px-3 py-2 rounded-lg text-[12px]"
                style={{ ...inputStyle, opacity: data.tickerRssEnabled ? 1 : 0.5 }}
              />

              <div className="flex gap-2 mt-4">
                <button
                  onClick={() => handleSave()}
                  disabled={saving}
                  className="flex-1 py-3 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:scale-[1.02] text-white shadow-sm cursor-pointer"
                  style={{ backgroundColor: "#0055ff", boxShadow: "0 4px 14px rgba(0,85,255,0.25)" }}
                >
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                  Salvar Ticker
                </button>
              </div>

              {data.tickerRssEnabled && data.tickerRssUrl && (
                <div className="mt-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[10px] uppercase tracking-wide font-bold text-slate-500">
                      Preview do feed
                    </span>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span
                        className="inline-block rounded-full"
                        style={{
                          width: 8, height: 8,
                          backgroundColor:
                            rssStatus.state === "ok" ? "#22c55e" :
                            rssStatus.state === "loading" ? "#eab308" :
                            rssStatus.state === "error" ? "#ef4444" : "#64748b",
                          boxShadow: rssStatus.state === "loading" ? "0 0 8px #eab308" : undefined,
                        }}
                      />
                      <span className="text-slate-600 font-medium">
                        {rssStatus.state === "ok" && `${rssStatus.count} títulos${rssStatus.via && rssStatus.via !== "direct" ? ` · via ${rssStatus.via}` : ""}`}
                        {rssStatus.state === "loading" && "carregando…"}
                        {rssStatus.state === "error" && "erro"}
                        {rssStatus.state === "idle" && "aguardando"}
                      </span>
                    </div>
                  </div>

                  {rssStatus.state === "error" && (
                    <div
                      className="text-[10.5px] p-2 rounded-md mb-2 bg-red-50 border border-red-200 text-red-700"
                    >
                      {rssStatus.message}
                      <div className="text-[9.5px] mt-1 text-red-600">
                        Alguns sites (Cloudflare/anti-bot) bloqueiam servidores. Tente um feed alternativo do mesmo portal.
                      </div>
                    </div>
                  )}

                  <div
                    className="rounded-md p-2 max-h-40 overflow-auto space-y-1 bg-white border border-slate-200"
                  >
                    {newsTitles.length === 0 ? (
                      <div className="text-[10.5px] text-center py-3 text-slate-400">
                        {rssStatus.state === "loading" ? "Buscando títulos…" : "Nenhum título recebido ainda."}
                      </div>
                    ) : (
                      newsTitles.slice(0, 15).map((t, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px] text-slate-700">
                          <span className="shrink-0 text-[9.5px] font-mono font-bold" style={{ color: CYAN }}>{String(i + 1).padStart(2, "0")}</span>
                          <span className="min-w-0 truncate">{t}</span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="space-y-2">
              {([
                { key: "tickerNews", icon: <Newspaper size={12} />, label: "Notícias", desc: "Títulos das últimas notícias" },
                { key: "tickerWeather", icon: <CloudSun size={12} />, label: "Previsão do Tempo", desc: "Tempo atual e amanhã" },
                { key: "tickerQuotes", icon: <TrendingUp size={12} />, label: "Cotações", desc: "Dólar e Euro (BRL)" },
                { key: "tickerSocials", icon: <Instagram size={12} />, label: "Redes Sociais", desc: "Escolha quais redes vão para o ticker" },
              ] as const).map(({ key, icon, label, desc }) => {
                const active = data[key];
                return (
                  <div key={key}>
                    <label
                      className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer"
                      style={{
                        backgroundColor: active ? "rgba(0,85,255,0.06)" : "#ffffff",
                        border: `1px solid ${active ? CYAN : NAVY_BORDER}`,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={e => {
                          const nextData = { ...latestDataRef.current, [key]: e.target.checked };
                          setData(nextData);
                          void handleSave(nextData);
                        }}
                        style={{ accentColor: CYAN }}
                      />
                      <span style={{ color: active ? CYAN : "#64748b" }}>{icon}</span>
                      <div className="min-w-0 flex-1">
                        <span className="text-[12px] font-bold text-slate-800 block">{label}</span>
                        <p className="text-[10px] text-slate-500 truncate">{desc}</p>
                      </div>
                    </label>

                    {/* Seleção da fonte das notícias (roteiro) */}
                    {key === "tickerNews" && active && (
                      <div
                        className="mt-2 ml-4 p-3 rounded-xl space-y-2 bg-slate-50 border border-slate-200"
                        style={{ borderLeft: `3px solid ${CYAN}` }}
                      >
                        <div className="text-[9px] font-bold uppercase tracking-widest" style={{ color: CYAN }}>
                          Fonte das notícias
                        </div>
                        <select
                          value={data.tickerNewsRoteiroId || ""}
                          onChange={e => {
                            const nextData = { ...latestDataRef.current, tickerNewsRoteiroId: e.target.value };
                            setData(nextData);
                            void handleSave(nextData);
                          }}
                          style={inputStyle}
                          className="w-full text-[11px]"
                        >
                          <option value="">Automático — último roteiro jornalístico</option>
                          {roteirosOptions.map(r => (
                            <option key={r.id} value={r.id}>
                              {r.titulo}
                              {r.created_at ? ` · ${String(r.created_at).slice(0, 10).split("-").reverse().join("/")}` : ""}
                              {r.count ? ` · ${r.count} títulos` : " · sem títulos"}
                            </option>
                          ))}
                        </select>
                        <p className="text-[9.5px] text-slate-500">
                          Escolha de qual roteiro os títulos serão exibidos no ticker.
                        </p>
                      </div>
                    )}

                    {/* QR Code do WhatsApp — logo abaixo de Notícias */}
                    {key === "tickerNews" && whatsappNumber && (
                      <label
                        className="mt-2 flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer"
                        style={{
                          backgroundColor: data.showQrCode ? "rgba(0,85,255,0.06)" : "#ffffff",
                          border: `1px solid ${data.showQrCode ? CYAN : NAVY_BORDER}`,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={data.showQrCode}
                          onChange={e => {
                            const nextData = { ...latestDataRef.current, showQrCode: e.target.checked };
                            setData(nextData);
                            void handleSave(nextData);
                          }}
                          style={{ accentColor: CYAN }}
                        />
                        <span style={{ color: data.showQrCode ? CYAN : "#64748b" }}><Phone size={12} /></span>
                        <div className="min-w-0 flex-1">
                          <span className="text-[12px] font-bold text-slate-800 block">QR Code (WhatsApp)</span>
                          <p className="text-[10px] text-slate-500 truncate">Exibir QR para interação ao vivo</p>
                        </div>
                      </label>
                    )}

                    {/* Submenu — seleção de redes sociais */}
                    {key === "tickerSocials" && active && (
                      <div
                        className="mt-2 ml-4 p-3 rounded-xl space-y-1.5 bg-slate-50 border border-slate-200"
                        style={{ borderLeft: `3px solid ${CYAN}` }}
                      >
                        <div className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: CYAN }}>
                          Redes enviadas ao ticker
                        </div>
                        {empresaSocials.length === 0 ? (
                          <p className="text-[10px] italic text-slate-400">Nenhuma rede social configurada na empresa.</p>
                        ) : (
                          empresaSocials.map(s => {
                            const selected = selectedSocialTypes.includes(s.tipo);
                            return (
                              <label key={s.tipo} className="flex items-center gap-2 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={e => {
                                    const base = selectedSocialTypes;
                                    const next = e.target.checked
                                      ? Array.from(new Set([...base, s.tipo]))
                                      : base.filter(t => t !== s.tipo);
                                    const nextData = { ...latestDataRef.current, tickerSocialTypes: next };
                                    setData(nextData);
                                    void handleSave(nextData);
                                  }}
                                  style={{ accentColor: CYAN }}
                                />
                                <span style={{ color: selected ? CYAN : "#64748b" }}>{s.icon}</span>
                                <span className="text-[11px] truncate font-medium" style={{ color: selected ? "#0f172a" : "#64748b" }}>{s.valor}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <textarea
              value={data.ticker}
              onChange={e => setData({ ...data, ticker: e.target.value })}
              onBlur={onFieldBlur}
              placeholder="Texto adicional (opcional)..."
              rows={3}
              className="w-full px-3 py-2 rounded-xl text-[12px] resize-none mt-4"
              style={inputStyle}
            />

            <label
              className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer mt-4"
              style={{
                backgroundColor: data.tickerUnitario ? "rgba(0,85,255,0.06)" : "#ffffff",
                border: `1px solid ${data.tickerUnitario ? CYAN : NAVY_BORDER}`,
              }}
              title="Quando ativo, o XML entrega apenas um item do ticker por vez, rotacionando a cada 4 segundos."
            >
              <input
                type="checkbox"
                checked={data.tickerUnitario}
                onChange={e => {
                  const nextData = { ...latestDataRef.current, tickerUnitario: e.target.checked };
                  setData(nextData);
                  void handleSave(nextData);
                }}
                style={{ accentColor: CYAN }}
              />
              <div className="min-w-0">
                <span className="text-[12px] font-bold text-slate-800 block">Envio Unitário</span>
                <p className="text-[10px] text-slate-500">Entrega um item por vez no XML, trocando a cada 4s</p>
              </div>
            </label>

            {/* Preview do ticker (o que está sendo enviado no XML) */}
            <div
              className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200"
            >
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-700">
                  Preview do Ticker · o que sai no XML
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-[9.5px] px-2 py-0.5 rounded-full font-bold bg-blue-50 text-[#0055ff] border border-blue-200">
                    Atualiza no XML a cada 5 min
                    {tickerSyncedAt
                      ? ` · ${tickerSyncedAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`
                      : ""}
                  </div>
                  <div className="text-[9.5px] px-2 py-0.5 rounded-full font-bold bg-blue-50 text-[#0055ff] border border-blue-200">
                    {data.tickerUnitario ? "Unitário · 4s por item" : "Contínuo"}
                  </div>
                </div>
              </div>


              <div
                className="overflow-hidden rounded-md relative bg-white border border-slate-200"
                style={{ height: 34 }}
              >
                {composedTicker ? (
                  <div
                    className="text-[13px] font-semibold absolute whitespace-nowrap text-slate-900"
                    style={{
                      lineHeight: "34px",
                      animation: `tickerSlidePv ${Math.max(18, Math.round(composedTicker.length * 0.22))}s linear infinite`,
                    }}
                  >
                    {composedTicker}
                    <style>{`
                      @keyframes tickerSlidePv {
                        0% { transform: translateX(0); }
                        100% { transform: translateX(-100%); }
                      }
                    `}</style>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-[11px] text-slate-400">
                    Ative fontes acima ou digite um texto para ver o preview.
                  </div>
                )}
              </div>


              {/* Preview de TODOS os textos setados no ticker */}
              <div className="mt-3">
                <div className="text-[9px] font-bold uppercase tracking-widest mb-1.5" style={{ color: CYAN }}>
                  Textos no ticker ({tickerItems.length})
                </div>
                <div
                  className="rounded-md p-2 max-h-56 overflow-auto space-y-1 bg-white border border-slate-200"
                >
                  {tickerItems.length === 0 ? (
                    <div className="text-[10.5px] text-center py-3 text-slate-400">
                      Nenhum texto ativo no ticker.
                    </div>
                  ) : (
                    tickerItems.map((it, i) => (
                      <div key={i} className="flex items-start gap-2 text-[11px]">
                        <span className="shrink-0 text-[9.5px] font-mono font-bold" style={{ color: CYAN }}>{String(i + 1).padStart(2, "0")}</span>
                        <span className="shrink-0 text-[9px] uppercase font-bold px-1.5 rounded bg-blue-50 text-[#0055ff] border border-blue-100">{it.source}</span>
                        <span className="min-w-0 flex-1 text-slate-700">{it.text}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Composição por fonte */}
              <div className="mt-3 space-y-1.5">
                {[
                  { on: data.tickerNews, label: "Notícias", value: newsTitles.length ? `${newsTitles.length} títulos` : "—" },
                  { on: data.tickerWeather, label: "Tempo", value: weatherText || "—" },
                  { on: data.tickerQuotes, label: "Cotações", value: quotesText || "—" },
                  { on: data.tickerSocials, label: "Redes", value: tickerSocialItems.length ? `${tickerSocialItems.length} canais` : "—" },
                  { on: !!data.ticker, label: "Texto livre", value: data.ticker || "—" },
                ].map((row, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span
                      className="inline-block rounded-full"
                      style={{ width: 6, height: 6, backgroundColor: row.on ? "#22c55e" : "#94a3b8" }}
                    />
                    <span className="font-medium" style={{ color: row.on ? "#0f172a" : "#94a3b8", minWidth: 70 }}>{row.label}</span>
                    <span className="truncate" style={{ color: row.on ? "#334155" : "#cbd5e1" }}>{row.value}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}

        {activeTab === "aseguir" && (
          <div className="max-w-3xl mx-auto p-6 rounded-2xl" style={cardStyle}>
            <SectionHeader n="03" label="A Seguir" color={CYAN} />

            <label
              className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer mt-4"
              style={{
                backgroundColor: data.aSeguirEnabled ? "rgba(0,85,255,0.06)" : "#ffffff",
                border: `1px solid ${data.aSeguirEnabled ? CYAN : NAVY_BORDER}`,
              }}
            >
              <input
                type="checkbox"
                checked={data.aSeguirEnabled}
                onChange={e => {
                  const nextData = { ...latestDataRef.current, aSeguirEnabled: e.target.checked };
                  setData(nextData);
                  void handleSave(nextData);
                }}
                style={{ accentColor: CYAN }}
              />
              <div className="min-w-0">
                <span className="text-[12px] font-bold text-slate-800 block">Habilitar módulo A Seguir</span>
                <p className="text-[10px] text-slate-500">
                  Envia no XML BROADCAST o nódulo <code>&lt;a_seguir&gt;</code> com foto do locutor (.png),
                  logo do programa (.png) e o texto "começa às: HH:MM" do próximo programa da grade.
                </p>
              </div>
            </label>

            <div className="mt-3 grid gap-3">
              {([
                { key: "aSeguirLeadSeconds" as const, label: "Entrar antes do início", hint: "Antecedência em relação ao horário do próximo programa — a informação permanece no XML até o início do programa", fallback: 300, options: [{ v: 300, l: "5 min" }, { v: 600, l: "10 min" }, { v: 900, l: "15 min" }] },
                { key: "aSeguirRefreshSeconds" as const, label: "Atualizar no XML a cada", hint: "Intervalo em que o backend regera as informações do programa a seguir no XML BROADCAST", fallback: 60, options: [{ v: 15, l: "15 s" }, { v: 30, l: "30 s" }, { v: 60, l: "1 min" }, { v: 120, l: "2 min" }, { v: 300, l: "5 min" }] },
              ]).map(({ key, label, hint, fallback, options }) => {
                const current = Number(data[key] ?? fallback);
                return (
                  <div
                    key={key}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200"
                    style={{ opacity: data.aSeguirEnabled ? 1 : 0.55 }}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: CYAN }}>{label}</div>
                    <p className="text-[10px] mb-3 text-slate-500">{hint}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {options.map(({ v, l }) => {
                        const active = current === v;
                        return (
                          <button
                            key={v}
                            type="button"
                            disabled={!data.aSeguirEnabled}
                            onClick={() => {
                              const nextData = { ...latestDataRef.current, [key]: v };
                              setData(nextData);
                              void handleSave(nextData);
                            }}
                            className="px-3 py-1.5 rounded-full text-[11px] font-bold tracking-wide transition-colors"
                            style={{
                              backgroundColor: active ? CYAN : "#ffffff",
                              color: active ? "#ffffff" : "#334155",
                              border: `1px solid ${active ? CYAN : "#cbd5e1"}`,
                              cursor: data.aSeguirEnabled ? "pointer" : "not-allowed",
                            }}
                          >
                            {l}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {data.aSeguirEnabled && (
              <div
                className="mt-3 px-4 py-2.5 rounded-xl flex items-center justify-between gap-2 text-[10px] bg-blue-50 border border-blue-200"
              >
                <span className="font-bold uppercase tracking-widest text-[#0055ff]">
                  Envio automático em backend ativo
                </span>
                <span className="font-mono text-slate-600">
                  {aSeguirSentAt
                    ? `último envio ${aSeguirSentAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
                    : "aguardando primeiro ciclo…"}
                </span>
              </div>
            )}

            {/* Countdown status */}
            <div
              className="mt-4 p-4 rounded-xl"
              style={{
                backgroundColor: data.aSeguirEnabled ? "rgba(0,85,255,0.05)" : "#f8fafc",
                border: `1px solid ${data.aSeguirEnabled ? "rgba(0,85,255,0.3)" : NAVY_BORDER}`,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: CYAN }}>Contagem regressiva</div>
                <span
                  className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider"
                  style={{
                    backgroundColor: data.aSeguirEnabled ? (nextProgramInfo?.isInWindow || nextProgramInfo?.isForced ? "#22c55e" : "#e2e8f0") : "#e2e8f0",
                    color: data.aSeguirEnabled ? (nextProgramInfo?.isInWindow || nextProgramInfo?.isForced ? "#ffffff" : "#64748b") : "#64748b",
                  }}
                >
                  {data.aSeguirEnabled ? (nextProgramInfo?.isForced ? "Forçado agora" : nextProgramInfo?.isInWindow ? "No ar no XML" : "Aguardando") : "Desligado"}
                </span>
              </div>

              {!data.aSeguirEnabled ? (
                <p className="text-[11px] text-slate-500">
                  Habilite o módulo A Seguir para ver a contagem regressiva.
                </p>
              ) : !nextProgramInfo ? (
                <p className="text-[11px] text-slate-500">
                  Nenhum programa seguinte encontrado na grade.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-medium">Próximo programa</span>
                    <span className="font-bold text-slate-800 truncate max-w-[55%]">
                      {nextProgramInfo.next?.nome || "—"} às {(nextProgramInfo.next?.horario_inicio || "").toString().slice(0, 5)}
                    </span>
                  </div>

                  {(nextProgramInfo.isInWindow || nextProgramInfo.isForced) ? (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 font-medium">XML preenchido por mais</span>
                      <span className="font-mono font-bold text-green-600">
                        {formatCountdown(nextProgramInfo.isForced ? nextProgramInfo.forcedRemainingSeconds : nextProgramInfo.windowCloseSeconds)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-500 font-medium">XML será preenchido em</span>
                      <span className="font-mono font-bold" style={{ color: CYAN }}>
                        {formatCountdown(nextProgramInfo.windowOpenSeconds)}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-500 font-medium">Permanecerá no XML</span>
                    <span className="font-mono font-bold text-slate-800">
                      {formatCountdown(nextProgramInfo.actualDurationSeconds)}
                    </span>
                  </div>

                  <div className="pt-2 text-[10px] text-slate-500">
                    As imagens e textos entram <strong className="text-slate-700">{formatCountdown(nextProgramInfo.windowOpenSeconds)}</strong> antes do início do próximo programa e ficam no XML por <strong className="text-slate-700">{formatCountdown(nextProgramInfo.actualDurationSeconds)}</strong>.
                  </div>
                </div>
              )}
            </div>

            {/* Prévia do XML */}
            <div
              className="mt-4 p-4 rounded-xl bg-slate-50 border border-slate-200"
            >
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: CYAN }}>
                  Prévia do XML — nódulo a_seguir
                </div>
                <span
                  className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider"
                  style={{
                    backgroundColor: aSeguirActive ? "#22c55e" : "#e2e8f0",
                    color: aSeguirActive ? "#ffffff" : "#64748b",
                  }}
                >
                  {aSeguirActive ? "Valores no XML agora" : "Fora da janela (blanck)"}
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {([
                  { label: "Logo do programa (.png)", url: aSeguirXmlPreview.programa_logo, caption: aSeguirXmlPreview.programa_nome || "—", contain: true },
                  { label: "Foto do locutor (.png)", url: aSeguirXmlPreview.locutor_foto, caption: aSeguirXmlPreview.locutor_nome || "—", contain: false },
                ]).map(({ label, url, caption, contain }) => (
                  <div key={label} className="rounded-lg overflow-hidden border border-slate-200 bg-white">
                    <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider text-slate-600 bg-slate-100">
                      {label}
                    </div>
                    <div className="relative w-full" style={{ paddingBottom: "56.25%", backgroundColor: "#f1f5f9" }}>
                      <img
                        src={url}
                        alt={label}
                        className="absolute inset-0 w-full h-full"
                        style={{ objectFit: contain ? "contain" : "cover", opacity: aSeguirActive ? 1 : 0.35 }}
                      />
                    </div>
                    <div className="px-2 py-1.5 text-[10px] truncate font-bold text-slate-800">{caption}</div>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-lg overflow-hidden border border-slate-200 bg-white">
                {([
                  ["ativo", aSeguirXmlPreview.ativo],
                  ["programa_nome", aSeguirXmlPreview.programa_nome],
                  ["locutor_nome", aSeguirXmlPreview.locutor_nome],
                  ["horario", aSeguirXmlPreview.horario],
                  ["texto", aSeguirXmlPreview.texto],
                  ["programa_logo", aSeguirXmlPreview.programa_logo],
                  ["locutor_foto", aSeguirXmlPreview.locutor_foto],
                ] as [string, string][]).map(([field, value], i) => {
                  // URLs de imagem: mostra apenas o nome do arquivo para evitar poluição visual
                  const isImg = field === "programa_logo" || field === "locutor_foto";
                  const short = isImg && value
                    ? (() => {
                        try {
                          const f = decodeURIComponent(new URL(value).pathname.split("/").pop() || value);
                          return f.length > 44 ? `${f.slice(0, 40)}…` : f;
                        } catch {
                          const f = value.split("/").pop() || value;
                          return f.length > 44 ? `${f.slice(0, 40)}…` : f;
                        }
                      })()
                    : value;
                  return (
                  <div
                    key={field}
                    className="flex items-start gap-3 px-3 py-1.5 text-[10px]"
                    style={{ backgroundColor: i % 2 === 0 ? "#f8fafc" : "#ffffff" }}
                  >
                    <span className="font-mono font-bold shrink-0 w-[110px]" style={{ color: CYAN }}>{field}</span>
                    <span className="font-mono break-all font-medium" style={{ color: value ? "#0f172a" : "#94a3b8" }} title={value || ""}>
                      {short || "(vazio)"}
                    </span>
                  </div>
                  );
                })}

              </div>

              <p className="mt-2 text-[10px] text-slate-500">
                As imagens são convertidas para .png pelo servidor no momento do envio — a prévia mostra a origem cadastrada.
              </p>
            </div>

            <div
              className="mt-4 p-5 rounded-2xl flex flex-col gap-4 bg-slate-50 border border-slate-200"
            >
              <div className="min-w-0">
                <div className="text-[12px] font-black uppercase tracking-widest mb-1 text-slate-800">Manual Force</div>
                <p className="text-[10px] text-slate-500">
                  Força o envio das informações do próximo programa ao XML pelo tempo configurado, ignorando a janela automática.
                </p>
                {data.aSeguirForceUntil && new Date(data.aSeguirForceUntil).getTime() > Date.now() && (
                  <p className="text-[10px] mt-2 font-bold text-green-600">
                    STATUS: ATIVO ATÉ {new Date(data.aSeguirForceUntil).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={!data.aSeguirEnabled || saving}
                onClick={() => {
                  // Força até o horário de início do próximo programa
                  const dur = Math.max(30, Number(nextProgramInfo?.secondsUntilStart) || 300);
                  const until = new Date(Date.now() + dur * 1000).toISOString();
                  const nextData = { ...latestDataRef.current, aSeguirForceUntil: until };
                  setData(nextData);
                  void handleSave(nextData);
                  toast.success(`Módulo A Seguir forçado por ${Math.round(dur / 60 * 10) / 10} min`);
                }}
                className="w-full py-3 rounded-xl text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all hover:scale-[1.02] text-white shadow-sm cursor-pointer"
                style={{
                  backgroundColor: data.aSeguirEnabled ? "#0055ff" : "#cbd5e1",
                  cursor: data.aSeguirEnabled ? "pointer" : "not-allowed",
                  boxShadow: data.aSeguirEnabled ? "0 4px 14px rgba(0,85,255,0.25)" : "none"
                }}
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                Forçar Envio Manual
              </button>
            </div>

            <div className="mt-4 p-4 rounded-xl text-[11px] leading-relaxed bg-slate-50 border border-slate-200 text-slate-600">
              <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: CYAN }}>Campos no XML</div>
              <div>a_seguir/ativo</div>
              <div>a_seguir/programa_nome</div>
              <div>a_seguir/nome_programa</div>
              <div>a_seguir/programa_logo (.png)</div>
              <div>a_seguir/locutor_nome</div>
              <div>a_seguir/locutor_foto (.png)</div>
              <div>a_seguir/horario</div>
              <div>a_seguir/texto → "começa às: 14:00"</div>
              <p className="mt-3 text-slate-500">
                As informações entram no XML conforme a antecedência configurada e permanecem até o horário de início do programa.
                Fora dessa janela, as imagens ficam com <code>blanck.png</code> e os textos vazios.
              </p>
            </div>
          </div>
        )}

        </div>

      </div>
    </div>
  );
}


/* ─── Video Live Preview (Streaming de Vídeo no frame do broadcast) ─── */
let hlsModule: typeof import("hls.js") | null = null;
const getHls = async () => {
  if (!hlsModule) hlsModule = await import("hls.js");
  return (hlsModule as any)?.default || hlsModule;
};

function VideoLivePreview({ streamUrl, reloadKey }: { streamUrl: string; reloadKey?: number }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !streamUrl) return;

    let cancelled = false;
    setIsLoaded(false);
    setHasError(false);

    // If YouTube URL
    const isYouTube = streamUrl.includes("youtube.com") || streamUrl.includes("youtu.be");
    if (isYouTube) return;

    (async () => {
      try {
        const Hls = await getHls();
        if (cancelled) return;

        if (hlsRef.current) {
          hlsRef.current.destroy();
          hlsRef.current = null;
        }

        const isHls = streamUrl.includes(".m3u8") || !streamUrl.match(/\.(mp4|webm|ogg)($|\?)/i);

        if (isHls && Hls.isSupported()) {
          const hls = new Hls({
            enableWorker: true,
            lowLatencyMode: true,
            backBufferLength: 0,
            maxBufferLength: 4,
            liveSyncDurationCount: 2,
            liveMaxLatencyDurationCount: 4,
          });
          hlsRef.current = hls;
          hls.loadSource(streamUrl);
          hls.attachMedia(video);

          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            if (!cancelled) {
              video.play().catch(() => {});
            }
          });
          hls.on(Hls.Events.FRAG_LOADED, () => {
            if (!cancelled) {
              setIsLoaded(true);
            }
          });
          hls.on(Hls.Events.ERROR, (_event: any, data: any) => {
            if (data.fatal) {
              console.warn("[BroadcastPreview] HLS error:", data.type);
              if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
                hls.startLoad();
              } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
                hls.recoverMediaError();
              } else {
                setHasError(true);
              }
            }
          });
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = streamUrl;
          video.addEventListener("loadeddata", () => {
            if (!cancelled) {
              video.play().catch(() => {});
              setIsLoaded(true);
            }
          });
          video.addEventListener("error", () => {
            if (!cancelled) setHasError(true);
          });
        } else {
          video.src = streamUrl;
          video.addEventListener("loadeddata", () => {
            if (!cancelled) {
              video.play().catch(() => {});
              setIsLoaded(true);
            }
          });
          video.addEventListener("error", () => {
            if (!cancelled) setHasError(true);
          });
        }
      } catch (err) {
        console.warn("[BroadcastPreview] Video init warning:", err);
        setHasError(true);
      }
    })();

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [streamUrl, reloadKey]);

  if (hasError || !streamUrl) {
    return null;
  }

  const isYouTube = streamUrl.includes("youtube.com") || streamUrl.includes("youtu.be");
  if (isYouTube) {
    let videoId = "";
    const match = streamUrl.match(/(?:v=|embed\/|shorts\/|live\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (match) videoId = match[1];
    if (!videoId) return null;
    return (
      <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&mute=1&controls=0&modestbranding=1&loop=1&playlist=${videoId}`}
          className="w-full h-full object-cover border-0 pointer-events-none scale-105"
          allow="autoplay; encrypted-media"
        />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
      <video
        ref={videoRef}
        muted
        autoPlay
        playsInline
        loop
        className="w-full h-full object-cover"
      />
    </div>
  );
}

/* ─── Mockup Preview component with animations ─── */
function MockupPreview({
  empresaLogo, programaNome, programaLogo, displayLocutor, locutorInstagram,
  locutorFoto, accentColor, assunto, showQrCode, whatsappNumber,
  empresaSocials, composedTicker, sponsorLogos, assuntoBgUrl, insertLiveArt,
  programaAssuntos = [], programaAssuntoRotation = 7,
  videoStreamUrl, reloadKey,
}: {
  empresaLogo: string; programaNome: string; programaLogo: string;
  displayLocutor: string; locutorInstagram: string; locutorFoto: string;
  accentColor: string; assunto: string; showQrCode: boolean;
  whatsappNumber: string; empresaSocials: SocialItem[]; composedTicker: string;
  sponsorLogos: {nome: string; logo_url: string}[];
  assuntoBgUrl?: string;
  insertLiveArt?: string;
  programaAssuntos?: string[];
  programaAssuntoRotation?: number;
  videoStreamUrl?: string | null;
  reloadKey?: number;
}) {
  // Social cycling animation
  const [socialIdx, setSocialIdx] = useState(0);
  const [socialVisible, setSocialVisible] = useState(true);

  // Sponsor logo cycling animation
  const [sponsorIdx, setSponsorIdx] = useState(0);
  const [sponsorVisible, setSponsorVisible] = useState(true);

  useEffect(() => {
    if (empresaSocials.length <= 1) return;
    const interval = setInterval(() => {
      setSocialVisible(false);
      setTimeout(() => {
        setSocialIdx(prev => (prev + 1) % empresaSocials.length);
        setSocialVisible(true);
      }, 400);
    }, 3000);
    return () => clearInterval(interval);
  }, [empresaSocials.length]);

  useEffect(() => {
    if (sponsorLogos.length <= 1) return;
    const interval = setInterval(() => {
      setSponsorVisible(false);
      setTimeout(() => {
        setSponsorIdx(prev => (prev + 1) % sponsorLogos.length);
        setSponsorVisible(true);
      }, 400);
    }, 5000);
    return () => clearInterval(interval);
  }, [sponsorLogos.length]);

  const currentSocial = empresaSocials[socialIdx] || null;
  const currentSponsor = sponsorLogos[sponsorIdx] || null;

  // Programa assunto rotation
  const [assuntoIdx, setAssuntoIdx] = useState(0);
  const [assuntoVisible, setAssuntoVisible] = useState(true);
  useEffect(() => {
    setAssuntoIdx(0);
  }, [programaAssuntos.join("|")]);
  useEffect(() => {
    if (programaAssuntos.length <= 1) return;
    const ms = Math.max(1, programaAssuntoRotation) * 1000;
    const interval = setInterval(() => {
      setAssuntoVisible(false);
      setTimeout(() => {
        setAssuntoIdx(prev => (prev + 1) % programaAssuntos.length);
        setAssuntoVisible(true);
      }, 350);
    }, ms);
    return () => clearInterval(interval);
  }, [programaAssuntos.length, programaAssuntoRotation]);
  const currentProgramaAssunto = programaAssuntos[assuntoIdx] || null;

  return (
    <div
      className="relative w-full h-full rounded-2xl overflow-hidden"
      style={{
        backgroundColor: "#000000",
        boxShadow: "0 24px 80px -20px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)",
      }}
    >
      {/* Video Streaming Preview (se o usuário tem canal de vídeo streaming cadastrado; senão, mantém preto) */}
      {videoStreamUrl ? (
        <VideoLivePreview streamUrl={videoStreamUrl} reloadKey={reloadKey} />
      ) : null}

      {/* Safe area guides (invisible but layout-based on 1920x1080 proportions) */}

      {/* ── Top bar ── */}
      <div className="absolute z-10 flex items-center justify-between pointer-events-none" style={{ top: "5%", left: "4%", right: "4%" }}>
        {/* Logo empresa + logos patrocinadores ao lado */}
        <div className="flex items-center gap-3">
          {empresaLogo ? (
            <img src={empresaLogo} alt="Logo" className="h-10 w-10 rounded-full object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-full flex items-center justify-center text-[8px] font-bold" style={{ backgroundColor: accentColor, color: "#000" }}>LOGO</div>
          )}
          {sponsorLogos.length > 0 && (
            <div className="flex items-center gap-2 pl-3" style={{ borderLeft: "1px solid rgba(255,255,255,0.15)" }}>
              {currentSponsor && (
                <div
                  className="transition-all duration-400 flex items-center"
                  style={{
                    opacity: sponsorVisible ? 1 : 0,
                    transform: sponsorVisible ? "scale(1)" : "scale(0.92)",
                    height: 44,
                  }}
                  title={currentSponsor.nome}
                >
                  <img
                    src={resolveSponsorLogoUrl(currentSponsor.logo_url, currentSponsor.nome)}
                    alt={currentSponsor.nome}
                    onError={(e) => {
                      const target = e.currentTarget as HTMLImageElement;
                      target.onerror = null;
                      target.src = "/default-sponsor-logo.png";
                    }}
                    className="h-10 max-w-[140px] object-contain"
                    style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.6))" }}
                  />
                </div>
              )}
              {sponsorLogos.length > 1 && (
                <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: "#ffffff50" }}>
                  +{sponsorLogos.length - 1}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Logo programa no ar */}
        <div className="flex items-center gap-2.5">
          <div className="text-right">
            <span className="text-[8px] font-medium uppercase tracking-wider block" style={{ color: "#ffffff60" }}>NO AR</span>
            <span className="text-[10px] font-bold block" style={{ color: "#fff" }}>{programaNome || "PROGRAMA"}</span>
          </div>
          {programaLogo ? (
            <img src={programaLogo} alt="Programa" className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-lg flex items-center justify-center text-[8px] font-bold" style={{ backgroundColor: accentColor + "30", color: accentColor, border: `1px solid ${accentColor}50` }}>PROG</div>
          )}
        </div>
      </div>

      {/* ── Bottom section ── */}
      <div className="absolute z-10 pointer-events-none" style={{ bottom: "4%", left: "4%", right: "4%" }}>

        {/* Locutor + QR + Assunto + Insert Live row */}
        <div className="flex items-end gap-2">
          <div className="flex-shrink-0" style={{ maxWidth: "45%" }}>
            {/* Locutor box */}
            <div
              className="backdrop-blur-sm relative overflow-hidden"
              style={{
                backgroundColor: "rgba(255,255,255,0.97)",
                padding: "8px 20px 6px",
                borderRadius: "6px 6px 0 0",
                minWidth: 180,
                minHeight: locutorFoto ? 84 : undefined,
              }}
            >
              {locutorFoto && (
                <img
                  src={locutorFoto}
                  alt={displayLocutor}
                  className="absolute bottom-0 left-0 object-contain object-left-bottom pointer-events-none"
                  style={{ height: "100%", maxWidth: "38%", opacity: 0.95 }}
                />
              )}

              <div className="relative" style={{ marginLeft: locutorFoto ? "38%" : 0 }}>
                <div className="text-sm font-black uppercase leading-tight tracking-wide" style={{ color: "#111" }}>
                  {displayLocutor}
                </div>
                {locutorInstagram && (
                  <div className="flex items-center gap-1 mt-0.5 text-[9px] font-semibold" style={{ color: accentColor }}>
                    <Instagram size={9} /> {locutorInstagram}
                  </div>
                )}
              </div>
            </div>

            {/* Programa Assunto (broadcast_assuntos) — abaixo do box do locutor */}
            {currentProgramaAssunto && (
              <div
                className="mt-1.5 backdrop-blur-sm"
                style={{
                  backgroundColor: "rgba(255,255,255,0.97)",
                  padding: "8px 16px",
                  borderRadius: 6,
                  borderLeft: `3px solid ${accentColor}`,
                  transition: "opacity 350ms ease",
                  opacity: assuntoVisible ? 1 : 0,
                }}
              >
                <div className="text-[8px] font-bold uppercase tracking-wider mb-0.5" style={{ color: accentColor }}>
                  Assunto do Programa {programaAssuntos.length > 1 && <span style={{ color: "#00000050" }}>· {assuntoIdx + 1}/{programaAssuntos.length}</span>}
                </div>
                <div className="text-[11px] font-bold leading-snug" style={{ color: "#111" }}>
                  {currentProgramaAssunto}
                </div>
              </div>
            )}

            {/* Subject bar – separated from ticker */}
            <div
              style={{
                backgroundColor: assuntoBgUrl ? "transparent" : "rgba(240,240,240,0.95)",
                backgroundImage: assuntoBgUrl ? `url(${assuntoBgUrl})` : undefined,
                backgroundSize: "cover",
                backgroundPosition: "center",
                backgroundRepeat: "no-repeat",
                padding: "10px 16px",
                borderRadius: "0 0 6px 6px",
                minHeight: assuntoBgUrl ? 38 : undefined,
              }}
            >
              <div className="flex items-center gap-2">
                {!assuntoBgUrl && (
                  <div className="w-1.5 h-5 rounded-sm flex-shrink-0" style={{ backgroundColor: accentColor }} />
                )}
                <span
                  className="text-sm font-black uppercase truncate"
                  style={{
                    color: assuntoBgUrl ? "#fff" : "#111",
                    textShadow: assuntoBgUrl ? "0 1px 4px rgba(0,0,0,0.7)" : undefined,
                  }}
                >
                  {assunto || "BASE PARA ASSUNTO"}
                </span>
              </div>
            </div>
          </div>

          {/* QR Code ao lado do locutor */}
          {showQrCode && whatsappNumber && (
            <div className="flex flex-col items-center gap-1 flex-shrink-0 pb-1">
              <div className="bg-white rounded-lg p-1.5 shadow-lg" style={{ boxShadow: `0 4px 20px ${accentColor}30` }}>
                <QRCodeSVG
                  value={`https://wa.me/${whatsappNumber.replace(/\D/g, "")}`}
                  size={64}
                  bgColor="#ffffff"
                  fgColor="#111111"
                />
              </div>
              <span className="text-[7px] font-semibold uppercase tracking-wider" style={{ color: "#ffffff70" }}>WhatsApp</span>
            </div>
          )}

          {/* Insert Live + Social item */}
          <div className="flex-1 flex flex-col items-end justify-end pb-2 pr-1 gap-2" style={{ minHeight: 40 }}>
            {/* Insert Live art — banner grande */}
            {insertLiveArt && (
              <img
                src={insertLiveArt}
                alt="Insert Live"
                className="object-contain"
                style={{ height: 190, maxWidth: 520, filter: `drop-shadow(0 8px 22px ${accentColor}66)` }}
              />
            )}
            {/* Social item */}
            {currentSocial && (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all duration-300"
                style={{
                  backgroundColor: accentColor + "18",
                  border: `1px solid ${accentColor}30`,
                  opacity: socialVisible ? 1 : 0,
                  transform: socialVisible ? "translateY(0)" : "translateY(6px)",
                }}
              >
                <span style={{ color: accentColor }}>{currentSocial.icon}</span>
                <span className="text-[10px] font-semibold" style={{ color: "#fff" }}>{currentSocial.valor}</span>
              </div>
            )}
          </div>
        </div>

        {/* Ticker bar – fundo branco, texto escuro rolando até o fim */}
        {composedTicker && (
          <div className="overflow-hidden mt-3" style={{ backgroundColor: "#FFFFFF", border: "1px solid #FFFFFF", height: 28, borderRadius: 8 }}>
            <div
              style={{
                display: "inline-block",
                whiteSpace: "nowrap",
                paddingLeft: "100%",
                lineHeight: "28px",
                animation: `tickerSlide ${Math.max(20, Math.round(composedTicker.length * 0.22))}s linear infinite`,
              }}
            >
              <span className="text-[11px] font-black uppercase tracking-widest" style={{ color: "#0A2540", opacity: 1 }}>
                {composedTicker.split(/(\s[▲▼]\s[+−]\d+[.,]\d{2}%)/g).map((seg, i) => {
                  const m = seg.match(/^\s([▲▼])\s([+−]\d+[.,]\d{2}%)$/);
                  if (m) {
                    const color = m[1] === "▲" ? "#16a34a" : "#dc2626";
                    return <span key={i} style={{ color }}>{seg}</span>;
                  }
                  return <span key={i}>{seg}</span>;
                })}
              </span>
            </div>

            <style>{`
              @keyframes tickerSlide {
                0% { transform: translateX(0); }
                100% { transform: translateX(-100%); }
              }
            `}</style>
          </div>
        )}
      </div>
    </div>
  );
}
