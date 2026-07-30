import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Loader2, Save, Instagram, Globe, MessageCircle, Facebook, Youtube, Phone, Newspaper, CloudSun, Search, Copy, Check, Code2, RefreshCw, Upload, X, Image as ImageIcon, TrendingUp } from "lucide-react";
import XmlLinkRow from "@/components/XmlLinkRow";
import XmlSection from "@/components/XmlSection";
import ProgramaAssuntosPanel from "@/components/broadcast/ProgramaAssuntosPanel";


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
  tickerUnitario: boolean;
  tickerRssEnabled: boolean;
  tickerRssUrl: string;
  showQrCode: boolean;
  assuntoBgUrl: string;
  useCustomAssuntoBg: boolean;
  assuntoBgProgramaIds: string[];
  aSeguirEnabled: boolean;
  aSeguirForceUntil?: string;
  aSeguirLeadSeconds: number;
  aSeguirDurationSeconds: number;
}

const defaultBroadcast: BroadcastData = {
  assunto: "",
  ticker: "",
  locutor_override: "",
  tickerNews: false,
  tickerWeather: false,
  tickerQuotes: false,
  tickerSocials: false,
  tickerUnitario: false,
  tickerRssEnabled: false,
  tickerRssUrl: "",
  showQrCode: false,
  assuntoBgUrl: "",
  useCustomAssuntoBg: false,
  assuntoBgProgramaIds: [],
  aSeguirEnabled: false,
  aSeguirForceUntil: "",
  aSeguirLeadSeconds: 180,
  aSeguirDurationSeconds: 120,
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


function computeNextProgramInfo(allProgs: any[], timezone: string | null | undefined, leadSeconds: number, durationSeconds: number, forceUntilIso?: string): NextProgramInfo | null {
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

  const endDelta = Math.max(0, leadSeconds - durationSeconds);
  const windowOpenSeconds = Math.max(0, secondsUntilStart - leadSeconds);
  const windowCloseSeconds = Math.max(0, secondsUntilStart - endDelta);
  const actualDurationSeconds = Math.max(0, leadSeconds - endDelta);
  const isInWindow = secondsUntilStart <= leadSeconds && secondsUntilStart >= endDelta;
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

export default function BroadcastPage() {
  const { user } = useAuth();

  const [data, setData] = useState<BroadcastData>(defaultBroadcast);
  const [saving, setSaving] = useState(false);
  const [empresaLogo, setEmpresaLogo] = useState<string | null>(null);
  const [programaLogo, setProgramaLogo] = useState<string | null>(null);
  const [locutorFoto, setLocutorFoto] = useState<string | null>(null);
  const [locutorNome, setLocutorNome] = useState("");
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
  const [activeTab, setActiveTab] = useState<"preview" | "ticker" | "aseguir" | "assuntos" | "xml">("preview");
  const [timezone, setTimezone] = useState<string | null>("America/Sao_Paulo");
  const [nextProgramInfo, setNextProgramInfo] = useState<NextProgramInfo | null>(null);
  const latestDataRef = useRef<BroadcastData>(defaultBroadcast);



  // Ticker auto-content
  const [newsTitles, setNewsTitles] = useState<string[]>([]);
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

  // Auto-sync foto/instagram/cargo whenever locutor_override matches a registered apresentador
  useEffect(() => {
    const nome = (data.locutor_override || "").trim();
    if (!user || nome.length < 2) return;
    const t = setTimeout(async () => {
      const { data: ap } = await supabase
        .from("apresentadores")
        .select("nome, foto, instagram, cargo")
        .eq("user_id", user.id)
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
  }, [data.locutor_override, user]);

  // Load data
  const loadInitialData = useCallback(async () => {
    if (!user) return;
    
    // Empresa config (logo + socials + timezone)
    const { data: emp } = await supabase
      .from("empresa_config")
      .select("logo, nome, instagram, facebook, youtube, site, telefone_participacao, timezone")
      .eq("user_id", user.id)
      .maybeSingle();

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

    // All programs (for linking assunto background and A Seguir countdown)
    const { data: allProgs } = await supabase
      .from("programas")
      .select("id, nome")
      .eq("user_id", user.id)
      .eq("ativo", true)
      .order("nome");
    if (allProgs) setAllProgramas(allProgs);

    const { data: allProgsFull } = await supabase
      .from("programas")
      .select("id, nome, selo, capa, thumb, apresentadores_ids, apresentador_id, dias_semana, horario_inicio, horario_fim, variavel, data_variavel, estudio")
      .eq("user_id", user.id)
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
      .eq("user_id", user.id)
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
      const { data: logos } = await supabase
        .from("logos_patrocinadores")
        .select("nome, logo_url")
        .eq("user_id", user.id)
        .eq("programa_id", prog.id)
        .eq("ativo", true)
        .eq("excluido", false);
      if (logos && logos.length > 0) setSponsorLogos(logos);
    }
  }, [user]);

  // Load programa_assuntos (broadcast_assuntos) for active program
  useEffect(() => {
    if (!user || !activeProgramaId) {
      setProgramaAssuntos([]);
      return;
    }
    (async () => {
      const { data: row } = await supabase
        .from("broadcast_assuntos")
        .select("mensagens, mensagens_enabled, rotation_seconds")
        .eq("user_id", user.id)
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
  }, [user, activeProgramaId]);


  useEffect(() => {
    if (!user) return;
    (async () => {
      await loadInitialData();
      const now = new Date();

      // Fetch today's LIVE event art (artes_urls[4] = INSERT LIVE)
      const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const { data: liveEvents } = await supabase
        .from("agenda_eventos")
        .select("artes_urls, programa_id")
        .eq("user_id", user.id)
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
      const { data: settings } = await supabase.from("user_settings").select("dashboard_items, weather_city, weather_lat, weather_lon").eq("user_id", user.id).maybeSingle();
      if (settings?.dashboard_items && typeof settings.dashboard_items === "object") {
        const lc = (settings.dashboard_items as any).layout_colors;
        if (lc?.accentColor) setAccentColor(lc.accentColor);
      }

      // Fetch ticker titles from latest journalistic roteiro
      // (skip when a custom RSS source is enabled — that effect owns newsTitles)
      const rssActive = !!(latestDataRef.current?.tickerRssEnabled && latestDataRef.current?.tickerRssUrl);
      if (!rssActive) {
        const { data: latestRoteiro } = await supabase
          .from("roteiros")
          .select("tickertitulos, conteudo_html")
          .eq("user_id", user.id)
          .eq("tipo_programa", "Jornalístico")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (latestRoteiro) {
          if (latestRoteiro.tickertitulos) {
            setNewsTitles(latestRoteiro.tickertitulos.split("  •  ").filter(Boolean));
          } else if (latestRoteiro.conteudo_html) {
            const matches = latestRoteiro.conteudo_html.match(/<strong>Notícia\s*\d+:<\/strong>\s*([^<]+)/g);
            if (matches) {
              const titles = matches.map((m: string) => m.replace(/<strong>Notícia\s*\d+:<\/strong>\s*/, "").trim()).filter(Boolean);
              setNewsTitles(titles);
            }
          }
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
      const { data: us } = await supabase.from("user_settings").select("cenario_config").eq("user_id", user.id).maybeSingle();
      if (us?.cenario_config && typeof us.cenario_config === "object") {
        const bc = (us.cenario_config as any).broadcast;
        if (bc) setData({ ...defaultBroadcast, ...bc });
      }
    })();
  }, [user]);

  // Detect program change every 60s — refresh locutor + reset override on switch
  useEffect(() => {
    if (!user) return;
    const refreshActiveProgram = async () => {
      const now = new Date();
      const nowTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:00`;
      const todayName = ["domingo","segunda","terca","quarta","quinta","sexta","sabado"][now.getDay()];
      const { data: progs } = await supabase
        .from("programas")
        .select("id, nome, selo, apresentadores_ids, apresentador_id, dias_semana")
        .eq("user_id", user.id)
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
    if (data.tickerSocials && empresaSocials.length > 0) {
      const labels: Record<string, string> = {
        instagram: "Instagram",
        facebook: "Facebook",
        youtube: "YouTube",
        site: "Site",
        whatsapp: "WhatsApp",
      };
      parts.push(
        empresaSocials
          .map(s => `${labels[s.tipo] || s.tipo}: ${s.valor}`)
          .join("  •  ")
      );
    }
    if (data.ticker) {
      parts.push(data.ticker);
    }
    return parts.join("  •  ");
  }, [data.tickerNews, data.tickerWeather, data.tickerQuotes, data.tickerSocials, data.ticker, newsTitles, weatherText, quotesText, empresaSocials]);

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
      lines.push(`      <url>${escXml(l.logo_url)}</url>`);
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
    if (!user) return;
    setSaving(true);
    const toastId = toast("Atualizando XML...", { icon: <RefreshCw size={14} className="animate-spin" /> });
    try {
      const { data: current } = await supabase.from("user_settings").select("cenario_config").eq("user_id", user.id).maybeSingle();
      const existing = (current?.cenario_config && typeof current.cenario_config === "object") ? current.cenario_config as Record<string, any> : {};
      const nextData = payload || latestDataRef.current;
      
      await supabase.from("user_settings").update({
        cenario_config: { ...existing, broadcast: nextData } as any,
      }).eq("user_id", user.id);

      toast.success("XML atualizado!", { id: toastId });
    } catch {
      toast.error("Erro ao salvar", { id: toastId });
    }
    setSaving(false);
  }, [user]);

  const onFieldBlur = useCallback(() => {
    handleSave();
  }, [handleSave]);

  const handleInsertNow = useCallback(async () => {
    if (!user || !insertLiveArt) return;
    setInsertingNow(true);
    try {
      const { data: cur } = await supabase.from("user_settings").select("cenario_config").eq("user_id", user.id).maybeSingle();
      const existing = (cur?.cenario_config && typeof cur.cenario_config === "object") ? cur.cenario_config as Record<string, any> : {};
      const broadcast = { ...(existing.broadcast || {}), insertLiveManualUntil: new Date(Date.now() + 30_000).toISOString() };
      await supabase.from("user_settings").update({ cenario_config: { ...existing, broadcast } as any }).eq("user_id", user.id);
      toast.success("Insert Live ativo por 30 segundos!");
      setTimeout(() => setInsertingNow(false), 30_000);
    } catch {
      toast.error("Erro ao inserir");
      setInsertingNow(false);
    }
  }, [user, insertLiveArt]);

  const [uploadingBg, setUploadingBg] = useState(false);
  const handleBgUpload = useCallback(async (file: File) => {
    if (!user || !file) return;
    if (file.type !== "image/png") {
      toast.error("A imagem deve ser .png");
      return;
    }
    setUploadingBg(true);
    try {
      const path = `broadcast/${user.id}/assunto-bg-${Date.now()}.png`;
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

  const NAVY = "#0A2540";
  const NAVY_DEEP = "#07192b";
  const NAVY_SOFT = "#0d2a45";
  const NAVY_BORDER = "#1a3a5a";
  const CYAN = "#00BFF0";
  const LIME = "#C6F03C";

  const inputStyle: React.CSSProperties = {
    backgroundColor: NAVY_DEEP,
    border: `1px solid ${NAVY_BORDER}`,
    color: "#fff",
    outline: "none",
    fontFamily: "'Manrope', sans-serif",
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: NAVY_DEEP,
    border: `1px solid ${NAVY_BORDER}`,
    borderRadius: 16,
  };

  const sectionHeaderStyle: React.CSSProperties = {
    fontFamily: "'Sora', sans-serif",
    fontWeight: 700,
    letterSpacing: "0.14em",
  };

  // Load Sora + Manrope once
  useEffect(() => {
    const id = "broadcast-fonts-sora-manrope";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id;
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Sora:wght@500;600;700;800&family=Manrope:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
  }, []);

  // Live clock
  const [nowClock, setNowClock] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNowClock(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // A Seguir countdown
  useEffect(() => {
    if (!user) return;
    const tick = () => {
      if (allProgramasFull.length === 0) return;
      const info = computeNextProgramInfo(
        allProgramasFull,
        timezone,
        Number(data.aSeguirLeadSeconds) || 180,
        Number(data.aSeguirDurationSeconds) || 120,
        data.aSeguirForceUntil,
      );
      setNextProgramInfo(info);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [user, allProgramasFull, timezone, data.aSeguirLeadSeconds, data.aSeguirDurationSeconds, data.aSeguirForceUntil]);

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




  const clockStr = `${String(nowClock.getHours()).padStart(2, "0")}:${String(nowClock.getMinutes()).padStart(2, "0")}:${String(nowClock.getSeconds()).padStart(2, "0")}`;

  const SectionHeader = ({ n, label, color = CYAN, right }: { n: string; label: string; color?: string; right?: React.ReactNode }) => (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <span
          className="inline-flex items-center justify-center rounded-md text-[10px] font-black"
          style={{ width: 22, height: 22, backgroundColor: color, color: NAVY, fontFamily: "'Sora', sans-serif" }}
        >
          {n}
        </span>
        <h2 className="text-white text-[11px] uppercase" style={sectionHeaderStyle}>{label}</h2>
      </div>
      {right}
    </div>
  );

  return (
    <div
      className="px-3 pt-3 pb-4 h-full min-h-0"
      style={{ fontFamily: "'Manrope', sans-serif", backgroundColor: "transparent" }}
    >
      <div className="w-full h-full min-h-0 flex flex-col gap-4">

        {/* ── Top toolbar: brand lockup + status console ── */}
        <div
          className="flex items-center justify-between gap-4 px-4 py-3"
          style={{
            ...cardStyle,
            background: `linear-gradient(90deg, ${NAVY_DEEP} 0%, ${NAVY_SOFT} 100%)`,
          }}
        >
          <div className="flex items-center gap-4 min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="text-white text-[10px] font-black tracking-widest px-2 py-1 rounded"
                style={{ backgroundColor: CYAN, color: NAVY, fontFamily: "'Sora', sans-serif" }}
              >
                VMIX
              </span>
              <span className="text-white/50 text-[10px] font-bold tracking-widest">/</span>
              <h2
                className="text-white text-sm uppercase tracking-tight"
                style={{ fontFamily: "'Sora', sans-serif", fontWeight: 700 }}
              >
                Broadcast
              </h2>
            </div>
            {programaNome && (
              <div
                className="hidden md:flex items-center gap-2 pl-4 min-w-0"
                style={{ borderLeft: `1px solid ${NAVY_BORDER}` }}
              >
                {programaLogo && (
                  <img src={programaLogo} alt="" className="w-7 h-7 rounded-md object-cover" style={{ border: `1px solid ${NAVY_BORDER}` }} />
                )}
                <div className="min-w-0">
                  <div className="text-[9px] uppercase tracking-widest" style={{ color: "#ffffff60" }}>Programa no ar</div>
                  <div className="text-[12px] font-bold text-white truncate" style={{ fontFamily: "'Sora', sans-serif" }}>{programaNome}</div>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {saving && (
              <span className="flex items-center gap-1.5 text-[10px] font-semibold" style={{ color: "#ffffff70" }}>
                <Loader2 size={11} className="animate-spin" /> Salvando
              </span>
            )}
            <span
              className="hidden sm:inline-block px-3 py-1.5 text-[11px] font-bold rounded-md font-mono"
              style={{ backgroundColor: NAVY_DEEP, color: LIME, border: `1px solid ${NAVY_BORDER}` }}
            >
              {clockStr}
            </span>
            <span
              className="px-3 py-1.5 text-[10px] font-black rounded-md flex items-center gap-1.5 uppercase tracking-widest"
              style={{ backgroundColor: "#dc2626", color: "#fff", fontFamily: "'Sora', sans-serif" }}
            >
              <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "#fff" }} /> LIVE
            </span>
            <span
              className="px-3 py-1.5 text-[10px] font-black rounded-md uppercase tracking-widest"
              style={{ backgroundColor: CYAN, color: NAVY, fontFamily: "'Sora', sans-serif" }}
            >
              vMix · ON
            </span>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div
          className="flex flex-wrap items-center gap-1 p-1 rounded-2xl flex-none"
          style={cardStyle}
        >
          {([
            { id: "preview", label: "Preview" },
            { id: "assuntos", label: "Assuntos" },
            { id: "ticker", label: "Ticker" },
            { id: "aseguir", label: "A Seguir" },
            { id: "xml", label: "XML" },
          ] as const).map(t => {
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className="px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest transition-all"
                style={{
                  backgroundColor: active ? CYAN : "transparent",
                  color: active ? NAVY : "#ffffff70",
                  fontFamily: "'Sora', sans-serif",
                  boxShadow: active ? "0 4px 10px rgba(0,191,240,0.25)" : "none",
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── Tab panels ── */}
        <div className="flex-1 min-h-0 overflow-y-auto pr-1">

        {activeTab === "preview" && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">


          {/* ── Left: Preview stage + status strip ── */}
          <div className="lg:col-span-8 flex flex-col gap-4 min-h-0 overflow-hidden">
            {/* 16:9 preview stage */}
            <div className="w-full flex items-center justify-center min-h-0">
              <div className="relative" style={{ width: "100%", aspectRatio: "16/9", maxHeight: "100%" }}>
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
                />
              </div>
            </div>

            {/* Status strip — 4 KPI tiles (clean, no duplicated toggles) */}
            <div className="grid grid-cols-4 gap-3 flex-none">
              <div className="p-3.5 rounded-2xl flex flex-col gap-1" style={cardStyle}>
                <span className="text-[9px] uppercase tracking-widest" style={{ color: "#ffffff60", ...sectionHeaderStyle, letterSpacing: "0.18em" }}>Locutor</span>
                <span className="text-[13px] font-bold truncate" style={{ color: LIME, fontFamily: "'Sora', sans-serif" }}>{displayLocutor}</span>
              </div>
              <div className="p-3.5 rounded-2xl flex flex-col gap-1" style={cardStyle}>
                <span className="text-[9px] uppercase tracking-widest" style={{ color: "#ffffff60", ...sectionHeaderStyle, letterSpacing: "0.18em" }}>Assunto</span>
                <span className="text-[13px] font-bold text-white truncate" style={{ fontFamily: "'Sora', sans-serif" }} title={data.assunto}>{data.assunto || "—"}</span>
              </div>
              <div className="p-3.5 rounded-2xl flex flex-col gap-1" style={cardStyle}>
                <span className="text-[9px] uppercase tracking-widest" style={{ color: "#ffffff60", ...sectionHeaderStyle, letterSpacing: "0.18em" }}>Patrocínios</span>
                <span className="text-[13px] font-bold" style={{ color: CYAN, fontFamily: "'Sora', sans-serif" }}>
                  {sponsorLogos.length} {sponsorLogos.length === 1 ? "ativo" : "ativos"}
                </span>
              </div>
              <div
                className="p-3.5 rounded-2xl flex flex-col gap-1"
                style={{
                  ...cardStyle,
                  boxShadow: insertLiveArt ? `inset 0 -3px 0 ${LIME}` : undefined,
                }}
              >
                <span className="text-[9px] uppercase tracking-widest" style={{ color: "#ffffff60", ...sectionHeaderStyle, letterSpacing: "0.18em" }}>Insert Live</span>
                <span className="text-[13px] font-bold text-white truncate" style={{ fontFamily: "'Sora', sans-serif" }}>
                  {insertLiveArt ? `${insertLiveSchedule.length || 0} slots` : "off"}
                </span>
              </div>
            </div>
          </div>


          {/* ── Right: settings column ── */}
          <div className="lg:col-span-4 flex flex-col gap-4 min-h-0 overflow-y-auto pr-1" style={{ maxHeight: "100%" }}>


          {/* Identidade */}
          <div className="p-4 rounded-2xl" style={cardStyle}>
            <SectionHeader n="01" label="Identidade" color={CYAN} />


            <div className="space-y-3">




              <div className="relative">
                <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: "#ffffff80" }}>Locutor (override)</label>
                <div className="relative">
                  <Search size={11} className="absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: "#ffffff60" }} />
                  <input
                    type="text"
                    value={data.locutor_override}
                    onChange={async e => {
                      const val = e.target.value;
                      setData({ ...data, locutor_override: val });
                      if (val.trim().length >= 2 && user) {
                        const { data: results } = await supabase
                          .from("apresentadores")
                          .select("nome, instagram, foto")
                          .eq("user_id", user.id)
                          .ilike("nome", `%${val.trim()}%`)
                          .limit(5);
                        setLocutorSearchResults(results || []);
                        setShowLocutorDropdown(true);
                      } else {
                        setLocutorSearchResults([]);
                        setShowLocutorDropdown(false);
                      }
                    }}
                    onFocus={() => { if (locutorSearchResults.length > 0) setShowLocutorDropdown(true); }}
                    onBlur={() => { setTimeout(() => setShowLocutorDropdown(false), 200); setTimeout(onFieldBlur, 300); }}
                    placeholder={locutorNome || "Buscar locutor..."}
                    className="w-full pl-7 pr-3 py-2 rounded-lg text-xs"
                    style={inputStyle}
                  />
                </div>
                {showLocutorDropdown && locutorSearchResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-hidden" style={{ backgroundColor: NAVY_DEEP, border: `1px solid ${NAVY_BORDER}` }}>
                    {locutorSearchResults.map((r, i) => (
                      <button
                        key={i}
                        onMouseDown={e => {
                          e.preventDefault();
                          setData({ ...data, locutor_override: r.nome });
                          if (r.instagram) setLocutorInstagram(r.instagram.startsWith("@") ? r.instagram : `@${r.instagram}`);
                          if (r.foto) setLocutorFoto(r.foto);
                          setShowLocutorDropdown(false);
                          setLocutorSearchResults([]);
                        }}
                        className="w-full text-left px-3 py-2 text-xs flex items-center gap-2 text-white hover:bg-white/5"
                        style={{ borderBottom: i < locutorSearchResults.length - 1 ? `1px solid ${NAVY_BORDER}` : "none" }}
                      >
                        {r.foto && <img src={r.foto} alt="" className="w-6 h-6 rounded-full object-cover" />}
                        <span className="font-semibold flex-1 truncate">{r.nome}</span>
                        {r.instagram && <span className="text-[10px]" style={{ color: CYAN }}>@{r.instagram.replace("@", "")}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Fundo do Assunto */}
              <div className="pt-2" style={{ borderTop: `1px solid ${NAVY_BORDER}` }}>
                <label className="text-[10px] font-bold uppercase mb-1 flex items-center justify-between" style={{ color: "#ffffff80" }}>
                  <span>Fundo do Assunto (.png)</span>
                  {data.assuntoBgUrl && (
                    <label className="flex items-center gap-1 cursor-pointer normal-case tracking-normal text-[9px]" style={{ color: "#fff" }}>
                      <input
                        type="checkbox"
                        checked={data.useCustomAssuntoBg}
                        onChange={e => {
                          const next = { ...latestDataRef.current, useCustomAssuntoBg: e.target.checked };
                          setData(next);
                          void handleSave(next);
                        }}
                        style={{ accentColor: CYAN }}
                      />
                      Usar
                    </label>
                  )}
                </label>
                {data.assuntoBgUrl ? (
                  <div className="relative rounded-lg overflow-hidden" style={{ backgroundColor: "#000", aspectRatio: "16/4" }}>
                    <img src={data.assuntoBgUrl} alt="Fundo assunto" className="w-full h-full object-contain" />
                    <button
                      onClick={removeBgImage}
                      className="absolute top-1 right-1 p-1 rounded-full"
                      style={{ backgroundColor: "rgba(0,0,0,0.6)", color: "#fff" }}
                      title="Remover"
                    >
                      <X size={11} />
                    </button>
                  </div>
                ) : (
                  <label className="flex items-center justify-center gap-2 px-3 py-3 rounded-lg cursor-pointer text-[11px] font-medium border-2 border-dashed" style={{ borderColor: NAVY_BORDER, color: "#ffffff80" }}>
                    {uploadingBg ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                    <span>{uploadingBg ? "Enviando..." : "Enviar PNG"}</span>
                    <input
                      type="file"
                      accept="image/png"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) handleBgUpload(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                )}
                <p className="text-[9px] mt-1" style={{ color: "#ffffff50" }}>
                  Padrão: apenas o texto. Imagem opcional substituirá o fundo da tarja.
                </p>

                {data.assuntoBgUrl && (
                  <div className="pt-2 relative">
                    <label className="text-[10px] font-bold uppercase mb-1 block" style={{ color: "#ffffff80" }}>
                      Vincular a programas
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowProgramDropdown(v => !v)}
                      className="w-full px-3 py-2 rounded-lg text-[11px] text-left flex items-center justify-between text-white"
                      style={inputStyle}
                    >
                      <span className="truncate">
                        {data.assuntoBgProgramaIds.length === 0
                          ? "Todos os programas (global)"
                          : `${data.assuntoBgProgramaIds.length} programa(s)`}
                      </span>
                      <span className="text-[9px]" style={{ color: "#ffffff60" }}>{showProgramDropdown ? "▲" : "▼"}</span>
                    </button>
                    {showProgramDropdown && (
                      <div className="absolute z-50 w-full mt-1 rounded-lg shadow-lg overflow-y-auto max-h-48" style={{ backgroundColor: NAVY_DEEP, border: `1px solid ${NAVY_BORDER}` }}>
                        {allProgramas.length === 0 ? (
                          <div className="px-3 py-2 text-[10px]" style={{ color: "#ffffff60" }}>Nenhum programa cadastrado</div>
                        ) : (
                          allProgramas.map(p => {
                            const checked = data.assuntoBgProgramaIds.includes(p.id);
                            return (
                              <label key={p.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer text-white hover:bg-white/5">
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={e => {
                                    const ids = new Set(latestDataRef.current.assuntoBgProgramaIds || []);
                                    if (e.target.checked) ids.add(p.id); else ids.delete(p.id);
                                    const next = { ...latestDataRef.current, assuntoBgProgramaIds: Array.from(ids) };
                                    setData(next);
                                    void handleSave(next);
                                  }}
                                  style={{ accentColor: CYAN }}
                                />
                                <span className="text-[11px] flex-1 truncate">{p.nome}</span>
                              </label>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={() => handleSave()}
                className="w-full py-2 rounded-full text-[10px] font-black uppercase tracking-widest"
                style={{ backgroundColor: CYAN, color: NAVY, boxShadow: "0 4px 10px rgba(0,191,240,0.3)" }}
              >
                Atualizar GC
              </button>
            </div>
          </div>

          {/* Redes Sociais */}
          <div className="p-4 rounded-2xl" style={cardStyle}>
            <SectionHeader
              n="02"
              label="Redes Sociais"
              color={LIME}
              right={<span className="text-[9px] font-bold uppercase" style={{ color: "#ffffff60" }}>{empresaSocials.length} ativas</span>}
            />


            {empresaSocials.length === 0 ? (
              <p className="text-[10px]" style={{ color: "#ffffff60" }}>Nenhuma rede social cadastrada.</p>
            ) : (
              <div className="space-y-1.5">
                {empresaSocials.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: NAVY_DEEP, border: `1px solid ${NAVY_BORDER}` }}>
                    <span style={{ color: CYAN }}>{s.icon}</span>
                    <span className="text-[11px] text-white truncate">{s.valor}</span>
                  </div>
                ))}
              </div>
            )}

            {whatsappNumber && (
              <label className="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer mt-2" style={{ backgroundColor: data.showQrCode ? "rgba(0,191,240,0.12)" : NAVY_DEEP, border: `1px solid ${data.showQrCode ? CYAN : NAVY_BORDER}` }}>
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
                <MessageCircle size={12} style={{ color: data.showQrCode ? CYAN : "#ffffff60" }} />
                <div>
                  <span className="text-[11px] font-semibold text-white">QR Code WhatsApp</span>
                  <p className="text-[9px]" style={{ color: "#ffffff60" }}>Exibir QR para enviar mensagem</p>
                </div>
              </label>
            )}
          </div>

          {/* Insert Live */}
          {insertLiveArt && (
            <div className="p-4 rounded-2xl" style={cardStyle}>
              <SectionHeader
                n="03"
                label="Insert Live · 30s"
                color="#f97316"
                right={<span className="text-[9px] font-bold uppercase" style={{ color: "#ffffff60" }}>{insertLiveSchedule.length} slots</span>}
              />


              {insertLiveSchedule.length > 0 ? (
                <div className="grid grid-cols-4 gap-2 mb-3">
                  {insertLiveSchedule.map((t, i) => (
                    <div
                      key={i}
                      className="rounded-lg py-2 text-center font-mono font-bold text-[11px]"
                      style={{ backgroundColor: NAVY_DEEP, border: `1px solid ${NAVY_BORDER}`, color: "#f97316" }}
                    >
                      {t}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] mb-3" style={{ color: "#ffffff60" }}>Sem agendamento (evento já iniciou ou antes das 07:00).</p>
              )}

              <button
                onClick={handleInsertNow}
                disabled={insertingNow}
                className="w-full px-3 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all disabled:opacity-60"
                style={{ backgroundColor: "#f97316", color: "#fff", boxShadow: "0 4px 10px rgba(249,115,22,0.3)" }}
              >
                {insertingNow ? "Inserindo (30s)..." : "Inserir Agora"}
              </button>
            </div>
          )}

          </div>
        </div>
        )}

        {activeTab === "assuntos" && (
          <div className="max-w-3xl mx-auto p-6 rounded-2xl" style={cardStyle}>
            <SectionHeader n="01" label="Assuntos do Programa" color={CYAN} />
            <ProgramaAssuntosPanel activeProgramaId={activeProgramaId} programaNome={programaNome} userId={user?.id} />
          </div>
        )}

        {activeTab === "ticker" && (
          <div className="max-w-3xl mx-auto p-6 rounded-2xl" style={cardStyle}>
            <SectionHeader n="02" label="Ticker System" color={CYAN} />

            {/* Fonte RSS/XML personalizada */}
            <div
              className="p-4 rounded-xl mb-3"
              style={{
                backgroundColor: data.tickerRssEnabled ? "rgba(0,191,240,0.10)" : NAVY_DEEP,
                border: `1px solid ${data.tickerRssEnabled ? CYAN : NAVY_BORDER}`,
              }}
            >
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="min-w-0">
                  <span className="text-[12px] font-semibold text-white block">Fonte RSS / XML personalizada</span>
                  <p className="text-[10px]" style={{ color: "#ffffff60" }}>
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
                  <span className="text-[11px]" style={{ color: data.tickerRssEnabled ? CYAN : "#ffffff70" }}>
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

              {data.tickerRssEnabled && data.tickerRssUrl && (
                <div className="mt-3">
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-[10px] uppercase tracking-wide" style={{ color: "#ffffff60" }}>
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
                      <span style={{ color: "#ffffff80" }}>
                        {rssStatus.state === "ok" && `${rssStatus.count} títulos${rssStatus.via && rssStatus.via !== "direct" ? ` · via ${rssStatus.via}` : ""}`}
                        {rssStatus.state === "loading" && "carregando…"}
                        {rssStatus.state === "error" && "erro"}
                        {rssStatus.state === "idle" && "aguardando"}
                      </span>
                    </div>
                  </div>

                  {rssStatus.state === "error" && (
                    <div
                      className="text-[10.5px] p-2 rounded-md mb-2"
                      style={{ backgroundColor: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.35)", color: "#fecaca" }}
                    >
                      {rssStatus.message}
                      <div className="text-[9.5px] mt-1" style={{ color: "#fecaca90" }}>
                        Alguns sites (Cloudflare/anti-bot) bloqueiam servidores. Tente um feed alternativo do mesmo portal.
                      </div>
                    </div>
                  )}

                  <div
                    className="rounded-md p-2 max-h-40 overflow-auto space-y-1"
                    style={{ backgroundColor: "rgba(0,0,0,0.35)", border: `1px dashed ${NAVY_BORDER}` }}
                  >
                    {newsTitles.length === 0 ? (
                      <div className="text-[10.5px] text-center py-3" style={{ color: "#ffffff50" }}>
                        {rssStatus.state === "loading" ? "Buscando títulos…" : "Nenhum título recebido ainda."}
                      </div>
                    ) : (
                      newsTitles.slice(0, 15).map((t, i) => (
                        <div key={i} className="flex items-start gap-2 text-[11px]" style={{ color: "#ffffffcc" }}>
                          <span className="shrink-0 text-[9.5px] font-mono" style={{ color: CYAN }}>{String(i + 1).padStart(2, "0")}</span>
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
                { key: "tickerSocials", icon: <Instagram size={12} />, label: "Redes Sociais", desc: "Instagram, Facebook, YouTube, Site, WhatsApp" },
              ] as const).map(({ key, icon, label, desc }) => {
                const active = data[key];
                return (
                  <label
                    key={key}
                    className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer"
                    style={{
                      backgroundColor: active ? "rgba(0,191,240,0.12)" : NAVY_DEEP,
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
                    <span style={{ color: active ? CYAN : "#ffffff60" }}>{icon}</span>
                    <div className="min-w-0 flex-1">
                      <span className="text-[12px] font-semibold text-white block">{label}</span>
                      <p className="text-[10px] truncate" style={{ color: "#ffffff60" }}>{desc}</p>
                    </div>
                  </label>
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
                backgroundColor: data.tickerUnitario ? "rgba(0,191,240,0.12)" : NAVY_DEEP,
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
                <span className="text-[12px] font-semibold text-white block">Envio Unitário</span>
                <p className="text-[10px]" style={{ color: "#ffffff60" }}>Entrega um item por vez no XML, trocando a cada 4s</p>
              </div>
            </label>

            {/* Preview do ticker (o que está sendo enviado no XML) */}
            <div
              className="mt-4 p-3 rounded-xl"
              style={{ backgroundColor: NAVY_DEEP, border: `1px solid ${NAVY_BORDER}` }}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: "#ffffff70" }}>
                  Preview do Ticker · o que sai no XML
                </div>
                <div className="text-[9.5px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(0,191,240,0.15)", color: CYAN }}>
                  {data.tickerUnitario ? "Unitário · 4s por item" : "Contínuo"}
                </div>
              </div>

              <div
                className="relative overflow-hidden rounded-md"
                style={{ backgroundColor: "#000", border: `1px solid ${NAVY_BORDER}`, height: 34 }}
              >
                {composedTicker ? (
                  <div
                    className="absolute whitespace-nowrap text-[13px] font-semibold flex items-center h-full"
                    style={{
                      color: "#ffffff",
                      animation: "tickerSlide 30s linear infinite",
                      paddingLeft: "100%",
                    }}
                  >
                    {composedTicker}
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full text-[11px]" style={{ color: "#ffffff50" }}>
                    Ative fontes acima ou digite um texto para ver o preview.
                  </div>
                )}
              </div>

              {/* Composição por fonte */}
              <div className="mt-3 space-y-1.5">
                {[
                  { on: data.tickerNews, label: "Notícias", value: newsTitles.length ? `${newsTitles.length} títulos` : "—" },
                  { on: data.tickerWeather, label: "Tempo", value: weatherText || "—" },
                  { on: data.tickerQuotes, label: "Cotações", value: quotesText || "—" },
                  { on: data.tickerSocials, label: "Redes", value: empresaSocials.length ? `${empresaSocials.length} canais` : "—" },
                  { on: !!data.ticker, label: "Texto livre", value: data.ticker || "—" },
                ].map((row, i) => (
                  <div key={i} className="flex items-center gap-2 text-[11px]">
                    <span
                      className="inline-block rounded-full"
                      style={{ width: 6, height: 6, backgroundColor: row.on ? "#22c55e" : "#64748b" }}
                    />
                    <span style={{ color: row.on ? "#ffffffcc" : "#ffffff50", minWidth: 70 }}>{row.label}</span>
                    <span className="truncate" style={{ color: row.on ? "#ffffff90" : "#ffffff40" }}>{row.value}</span>
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
                backgroundColor: data.aSeguirEnabled ? "rgba(0,191,240,0.12)" : NAVY_DEEP,
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
                <span className="text-[12px] font-semibold text-white block">Habilitar módulo A Seguir</span>
                <p className="text-[10px]" style={{ color: "#ffffff60" }}>
                  Envia no XML BROADCAST o nódulo <code>&lt;a_seguir&gt;</code> com foto do locutor (.png),
                  logo do programa (.png) e o texto "começa às: HH:MM" do próximo programa da grade.
                </p>
              </div>
            </label>

            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {([
                { key: "aSeguirLeadSeconds" as const, label: "Entrar antes do início", hint: "Antecedência em relação ao horário do próximo programa", fallback: 180 },
                { key: "aSeguirDurationSeconds" as const, label: "Permanecer no XML", hint: "Tempo em que as informações ficam no XML", fallback: 120 },
              ]).map(({ key, label, hint, fallback }) => {
                const current = Number(data[key] ?? fallback);
                return (
                  <div
                    key={key}
                    className="p-4 rounded-xl"
                    style={{ backgroundColor: NAVY_DEEP, border: `1px solid ${NAVY_BORDER}`, opacity: data.aSeguirEnabled ? 1 : 0.55 }}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: CYAN }}>{label}</div>
                    <p className="text-[10px] mb-3" style={{ color: "#ffffff55" }}>{hint}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { v: 30, l: "30s" },
                        { v: 60, l: "1min" },
                        { v: 90, l: "1min30" },
                        { v: 120, l: "2min" },
                        { v: 180, l: "3min" },
                      ].map(({ v, l }) => {
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
                              backgroundColor: active ? CYAN : "rgba(255,255,255,0.06)",
                              color: active ? "#04121b" : "#ffffffcc",
                              border: `1px solid ${active ? CYAN : NAVY_BORDER}`,
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

            {/* Countdown status */}

            <div
              className="mt-4 p-4 rounded-xl"
              style={{
                backgroundColor: data.aSeguirEnabled ? "rgba(0,191,240,0.08)" : NAVY_DEEP,
                border: `1px solid ${data.aSeguirEnabled ? CYAN : NAVY_BORDER}`,
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: CYAN }}>Contagem regressiva</div>
                <span
                  className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider"
                  style={{
                    backgroundColor: data.aSeguirEnabled ? (nextProgramInfo?.isInWindow || nextProgramInfo?.isForced ? LIME : "#0d2a45") : "#0d2a45",
                    color: data.aSeguirEnabled ? (nextProgramInfo?.isInWindow || nextProgramInfo?.isForced ? NAVY : "#ffffff70") : "#ffffff70",
                  }}
                >
                  {data.aSeguirEnabled ? (nextProgramInfo?.isForced ? "Forçado agora" : nextProgramInfo?.isInWindow ? "No ar no XML" : "Aguardando") : "Desligado"}
                </span>
              </div>

              {!data.aSeguirEnabled ? (
                <p className="text-[11px]" style={{ color: "#ffffff60" }}>
                  Habilite o módulo A Seguir para ver a contagem regressiva.
                </p>
              ) : !nextProgramInfo ? (
                <p className="text-[11px]" style={{ color: "#ffffff60" }}>
                  Nenhum programa seguinte encontrado na grade.
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span style={{ color: "#ffffff80" }}>Próximo programa</span>
                    <span className="font-semibold text-white truncate max-w-[55%]">
                      {nextProgramInfo.next?.nome || "—"} às {(nextProgramInfo.next?.horario_inicio || "").toString().slice(0, 5)}
                    </span>
                  </div>

                  {(nextProgramInfo.isInWindow || nextProgramInfo.isForced) ? (
                    <div className="flex items-center justify-between text-[11px]">
                      <span style={{ color: "#ffffff80" }}>XML preenchido por mais</span>
                      <span className="font-mono font-bold" style={{ color: LIME }}>
                        {formatCountdown(nextProgramInfo.isForced ? nextProgramInfo.forcedRemainingSeconds : nextProgramInfo.windowCloseSeconds)}
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-[11px]">
                      <span style={{ color: "#ffffff80" }}>XML será preenchido em</span>
                      <span className="font-mono font-bold" style={{ color: CYAN }}>
                        {formatCountdown(nextProgramInfo.windowOpenSeconds)}
                      </span>
                    </div>
                  )}


                  <div className="flex items-center justify-between text-[11px]">
                    <span style={{ color: "#ffffff80" }}>Permanecerá no XML</span>
                    <span className="font-mono font-bold text-white">
                      {formatCountdown(nextProgramInfo.actualDurationSeconds)}
                    </span>
                  </div>

                  <div className="pt-2 text-[10px]" style={{ color: "#ffffff60" }}>
                    As imagens e textos entram <strong style={{ color: "#fff" }}>{formatCountdown(nextProgramInfo.windowOpenSeconds)}</strong> antes do início do próximo programa e ficam no XML por <strong style={{ color: "#fff" }}>{formatCountdown(nextProgramInfo.actualDurationSeconds)}</strong>.
                  </div>
                </div>
              )}
            </div>

            {/* Prévia do XML */}
            <div
              className="mt-4 p-4 rounded-xl"
              style={{ backgroundColor: NAVY_DEEP, border: `1px solid ${aSeguirActive ? LIME : NAVY_BORDER}` }}
            >
              <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
                <div className="text-[10px] font-bold uppercase tracking-widest" style={{ color: CYAN }}>
                  Prévia do XML — nódulo a_seguir
                </div>
                <span
                  className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider"
                  style={{
                    backgroundColor: aSeguirActive ? LIME : "#0d2a45",
                    color: aSeguirActive ? NAVY : "#ffffff70",
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
                  <div key={label} className="rounded-lg overflow-hidden" style={{ border: `1px solid ${NAVY_BORDER}` }}>
                    <div className="px-2 py-1 text-[9px] font-bold uppercase tracking-wider" style={{ color: "#ffffff70", backgroundColor: "rgba(255,255,255,0.04)" }}>
                      {label}
                    </div>
                    <div className="relative w-full" style={{ paddingBottom: "56.25%", backgroundColor: "#0a1a2b" }}>
                      <img
                        src={url}
                        alt={label}
                        className="absolute inset-0 w-full h-full"
                        style={{ objectFit: contain ? "contain" : "cover", opacity: aSeguirActive ? 1 : 0.35 }}
                      />
                    </div>
                    <div className="px-2 py-1.5 text-[10px] truncate text-white">{caption}</div>
                  </div>
                ))}
              </div>

              <div className="mt-3 rounded-lg overflow-hidden" style={{ border: `1px solid ${NAVY_BORDER}` }}>
                {([
                  ["ativo", aSeguirXmlPreview.ativo],
                  ["programa_nome", aSeguirXmlPreview.programa_nome],
                  ["locutor_nome", aSeguirXmlPreview.locutor_nome],
                  ["horario", aSeguirXmlPreview.horario],
                  ["texto", aSeguirXmlPreview.texto],
                  ["programa_logo", aSeguirXmlPreview.programa_logo],
                  ["locutor_foto", aSeguirXmlPreview.locutor_foto],
                ] as [string, string][]).map(([field, value], i) => (
                  <div
                    key={field}
                    className="flex items-start gap-3 px-3 py-1.5 text-[10px]"
                    style={{ backgroundColor: i % 2 === 0 ? "rgba(255,255,255,0.03)" : "transparent" }}
                  >
                    <span className="font-mono shrink-0 w-[110px]" style={{ color: CYAN }}>{field}</span>
                    <span className="font-mono break-all" style={{ color: value ? "#ffffffdd" : "#ffffff45" }}>
                      {value || "(vazio)"}
                    </span>
                  </div>
                ))}
              </div>

              <p className="mt-2 text-[10px]" style={{ color: "#ffffff55" }}>
                As imagens são convertidas para .png pelo servidor no momento do envio — a prévia mostra a origem cadastrada.
              </p>
            </div>

            <div
              className="mt-4 p-4 rounded-xl flex items-center justify-between gap-4 flex-wrap"
              style={{ backgroundColor: NAVY_DEEP, border: `1px solid ${NAVY_BORDER}` }}
            >

              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-white">Envio manual</div>
                <p className="text-[10px]" style={{ color: "#ffffff60" }}>
                  Força o envio das informações do próximo programa ao XML pelo tempo de permanência configurado, fora da janela automática.
                </p>
                {data.aSeguirForceUntil && new Date(data.aSeguirForceUntil).getTime() > Date.now() && (
                  <p className="text-[10px] mt-1" style={{ color: CYAN }}>
                    Ativo até {new Date(data.aSeguirForceUntil).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={!data.aSeguirEnabled}
                onClick={() => {
                  const dur = Number(latestDataRef.current.aSeguirDurationSeconds) > 0
                    ? Number(latestDataRef.current.aSeguirDurationSeconds)
                    : 120;
                  const until = new Date(Date.now() + dur * 1000).toISOString();
                  const nextData = { ...latestDataRef.current, aSeguirForceUntil: until };
                  setData(nextData);
                  void handleSave(nextData);
                  toast.success(`A Seguir enviado ao XML por ${Math.round(dur / 60 * 10) / 10} min`);
                }}
                className="px-4 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider"
                style={{
                  backgroundColor: data.aSeguirEnabled ? CYAN : NAVY_BORDER,
                  color: data.aSeguirEnabled ? "#04121b" : "#ffffff50",
                  cursor: data.aSeguirEnabled ? "pointer" : "not-allowed",
                }}
              >
                Enviar agora
              </button>
            </div>

            <div className="mt-4 p-4 rounded-xl text-[11px] leading-relaxed" style={{ backgroundColor: NAVY_DEEP, border: `1px solid ${NAVY_BORDER}`, color: "#ffffff80" }}>
              <div className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: CYAN }}>Campos no XML</div>
              <div>a_seguir/ativo</div>
              <div>a_seguir/programa_nome</div>
              <div>a_seguir/programa_logo (.png)</div>
              <div>a_seguir/locutor_nome</div>
              <div>a_seguir/locutor_foto (.png)</div>
              <div>a_seguir/horario</div>
              <div>a_seguir/texto → "começa às: 14:00"</div>
              <p className="mt-3" style={{ color: "#ffffff60" }}>
                As informações entram no XML conforme a antecedência configurada e permanecem pelo tempo definido.
                Fora dessa janela, as imagens ficam com <code>blanck.png</code> e os textos vazios.
              </p>
            </div>
          </div>
        )}


        {activeTab === "xml" && (
          <div className="max-w-3xl mx-auto p-6 rounded-2xl space-y-3" style={cardStyle}>
            <SectionHeader n="03" label="Endpoints XML" color={CYAN} />
            <XmlSection title="Endpoints XML">
              <XmlLinkRow
                label="Broadcast XML"
                kicker="XML"
                permanentUrl={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-xml-broadcast?user_id=${user?.id}`}
              />
              <XmlLinkRow
                label="TClock Shows"
                kicker="XML"
                permanentUrl={`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/serve-xml-tclock-shows?user_id=${user?.id}`}
              />
            </XmlSection>
          </div>
        )}

        </div>

      </div>
    </div>
  );
}


/* ─── Mockup Preview component with animations ─── */
function MockupPreview({
  empresaLogo, programaNome, programaLogo, displayLocutor, locutorInstagram,
  locutorFoto, accentColor, assunto, showQrCode, whatsappNumber,
  empresaSocials, composedTicker, sponsorLogos, assuntoBgUrl, insertLiveArt,
  programaAssuntos = [], programaAssuntoRotation = 7,
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
      {/* Safe area guides (invisible but layout-based on 1920x1080 proportions) */}

      {/* ── Top bar ── */}
      <div className="absolute flex items-center justify-between" style={{ top: "5%", left: "4%", right: "4%" }}>
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
                    src={currentSponsor.logo_url}
                    alt={currentSponsor.nome}
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
      <div className="absolute" style={{ bottom: "4%", left: "4%", right: "4%" }}>

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
                minHeight: locutorFoto ? 72 : undefined,
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

        {/* Ticker bar – separate from title, with gap */}
        {composedTicker && (
          <div className="overflow-hidden mt-3" style={{ backgroundColor: accentColor + "18", border: `1px solid ${accentColor}30`, height: 28, borderRadius: 8 }}>
            <div
              className="flex items-center h-full whitespace-nowrap"
              style={{
                animation: "tickerSlide 20s linear infinite",
                paddingLeft: "100%",
              }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "#fff" }}>
                {composedTicker.split(/(\s[▲▼]\s[+−]\d+[.,]\d{2}%)/g).map((seg, i) => {
                  const m = seg.match(/^\s([▲▼])\s([+−]\d+[.,]\d{2}%)$/);
                  if (m) {
                    const color = m[1] === "▲" ? "#22c55e" : "#ef4444";
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
