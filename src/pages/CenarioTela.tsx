import { useState, useEffect, useRef, useCallback } from "react";
import { Home, CloudSun, Car, DollarSign, MessageCircle, Thermometer, Droplets, CloudRain, CalendarDays, TrendingUp, TrendingDown, Minus, Loader2, ChevronUp, ChevronDown, Pen, Eraser, Clock, Music, Mic, Play, MapPin, Sun, Tag } from "lucide-react";
import { WeatherIcon } from "@/components/WeatherIcons";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { usePageTitle } from "@/hooks/usePageTitle";
import TrafficMap from "@/components/TrafficMap";
import SatelliteMap from "@/components/SatelliteMap";
import CenarioQuotesPanel from "@/components/cenario/CenarioQuotesPanel";
import { musicDataKey, musicStartKey, MUSIC_DATA_EVENT } from "@/lib/musicStorageKeys";
import { resolveSponsorLogoUrl } from "@/lib/sponsorLogoResolver";
import { extractDominantPair } from "@/lib/dominantColors";

/* ─── types (mirrored from CenarioInterativoPage) ─── */
interface WeatherConfig { enabled: boolean; showCurrent: boolean; showForecast3Days: boolean; showSatellite: boolean; city: string; bgImage: string; }
interface TrafficConfig { enabled: boolean; city: string; points: any[]; bgImage: string; lat: number | null; lon: number | null; zoom: number; }
interface CurrencyConfig { enabled: boolean; currencies: string[]; bgImage: string; }
interface EnqueteConfig { enabled: boolean; bgImage: string; }
interface ChatConfig { enabled: boolean; youtubeVideoUrl: string; bgImage: string; }
interface HomeConfig { bgImage: string; bgGradient?: boolean; bgGradientColorA?: string; bgGradientColorB?: string; bgGradientType?: "linear" | "radial"; bgGradientAngle?: number; exceptionWords?: string; elementPositions?: Record<string, { x: number; y: number; scale: number }>; artistOverlayEnabled?: boolean; artistOverlayColor?: string; artistOverlayOpacity?: number; showMusicCover?: boolean; showProgramThumb?: boolean; colorButtonBgOff?: string; colorButtonBgOn?: string; colorButtonOff?: string; colorButtonOn?: string; colorClock?: string; colorDate?: string; colorMusicName?: string; colorMusicTitle?: string; colorASeguirLabel?: string; colorNextProgram?: string; colorProgressBar?: string; }
interface CenarioConfig { city: string; useProgramThumbAsBg?: boolean; programThumbPosition?: string; thumbOverlayEnabled?: boolean; thumbOverlayColor?: string; thumbOverlayOpacity?: number; bgAlternateMode?: boolean; home: HomeConfig; weather: WeatherConfig; traffic: TrafficConfig; currency: CurrencyConfig; enquete: EnqueteConfig; chat: ChatConfig; }

interface PublicCenarioPayload {
  ok: boolean;
  cenario_config: CenarioConfig;
  currentProgram: any;
  nextProgram: any;
  sponsorLogos: any[];
  musicData: any;
  musicStartTime: number | null;
  accentColor: string | null;
  musicXmlUrl: string | null;
  youtubeChatMessages: any[] | null;
  enquetes?: any[];
}

function buildHomeGradient(h: HomeConfig): string {
  const a = h.bgGradientColorA || "#1a1a2e";
  const b = h.bgGradientColorB || "#16213e";
  const type = h.bgGradientType || "linear";
  const angle = h.bgGradientAngle ?? 135;
  return type === "radial" ? `radial-gradient(circle, ${a}, ${b})` : `linear-gradient(${angle}deg, ${a}, ${b})`;
}

const defaultConfig: CenarioConfig = {
  city: "", home: { bgImage: "", colorButtonBgOff: "rgba(0,0,0,0.8)", colorButtonBgOn: "rgba(0,191,240,0.85)", colorButtonOff: "rgba(255,255,255,0.7)", colorButtonOn: "#FFFFFF" },

  weather: { enabled: true, showCurrent: true, showForecast3Days: true, showSatellite: false, city: "", bgImage: "" },
  traffic: { enabled: false, city: "", points: [], bgImage: "", lat: null, lon: null, zoom: 13 },
  currency: { enabled: true, currencies: ["USD", "EUR"], bgImage: "" },
  enquete: { enabled: true, bgImage: "" },
  chat: { enabled: false, youtubeVideoUrl: "", bgImage: "" },
};

const CURRENCY_OPTIONS = [
  { value: "USD", label: "Dólar Comercial (USD)", flag: "US" }, { value: "EUR", label: "Euro (EUR)", flag: "EU" },
  { value: "GBP", label: "Libra Esterlina (GBP)", flag: "GB" }, { value: "ARS", label: "Peso Argentino (ARS)", flag: "AR" },
  { value: "JPY", label: "Iene Japonês (JPY)", flag: "JP" }, { value: "BTC", label: "Bitcoin (BTC)", flag: "BT" }, { value: "ETH", label: "Ethereum (ETH)", flag: "ET" },
];

const CURRENCY_API_MAP: Record<string, string> = {
  USD: "USD-BRL", EUR: "EUR-BRL", GBP: "GBP-BRL", ARS: "ARS-BRL", JPY: "JPY-BRL", BTC: "BTC-BRL", ETH: "ETH-BRL",
};

const COUNTRY_FLAG_MAP: Record<string, string> = {
  US: "🇺🇸", EU: "🇪🇺", GB: "🇬🇧", AR: "🇦🇷", JP: "🇯🇵", BT: "₿", ET: "Ξ",
  BR: "🇧🇷", DE: "🇩🇪", IT: "🇮🇹", FR: "🇫🇷", CA: "🇨🇦", AU: "🇦🇺", CN: "🇨🇳", CH: "🇨🇭",
};
interface LiveCurrency { code: string; name: string; value: string; change: string; direction: "up" | "down" | "neutral"; }
async function fetchLiveCurrencies(codes: string[]): Promise<LiveCurrency[]> {
  if (!codes.length) return [];
  const pairs = codes.map(c => CURRENCY_API_MAP[c]).filter(Boolean).join(",");
  if (!pairs) return [];
  try {
    const res = await fetch(`https://economia.awesomeapi.com.br/last/${pairs}`);
    const data = await res.json();
    return codes.map(c => {
      const key = CURRENCY_API_MAP[c]?.replace("-", "");
      const item = data[key];
      if (!item) return null;
      const pct = parseFloat(item.pctChange);
      const opt = CURRENCY_OPTIONS.find(o => o.value === c);
      return {
        code: c, name: opt?.label?.split("(")[0]?.trim() || item.name,
        value: parseFloat(item.bid).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
        change: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`,
        direction: pct > 0 ? "up" as const : pct < 0 ? "down" as const : "neutral" as const,
      };
    }).filter(Boolean) as LiveCurrency[];
  } catch { return []; }
}

/* ─── Stock Exchange ─── */
const STOCK_EXCHANGES = [
  { symbol: "^BVSP", name: "Ibovespa", flag: "🇧🇷" },
  { symbol: "^GSPC", name: "S&P 500", flag: "🇺🇸" },
  { symbol: "^DJI", name: "Dow Jones", flag: "🇺🇸" },
  { symbol: "^IXIC", name: "Nasdaq", flag: "🇺🇸" },
  { symbol: "^FTSE", name: "FTSE 100", flag: "🇬🇧" },
  { symbol: "^N225", name: "Nikkei 225", flag: "🇯🇵" },
  { symbol: "^GDAXI", name: "DAX", flag: "🇩🇪" },
];
interface LiveStock { symbol: string; name: string; flag: string; value: string; change: string; direction: "up" | "down" | "neutral"; }
async function fetchLiveStocks(): Promise<LiveStock[]> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const res = await fetch(`${supabaseUrl}/functions/v1/fetch-stocks`, { headers: { "Content-Type": "application/json" } });
    if (!res.ok) throw new Error("fetch-stocks failed");
    const data = await res.json();
      return (data.stocks || []) as LiveStock[];
  } catch { return []; }
}

/* ─── Simple XML music parser (browser-side fallback for local network XMLs) ─── */
function extractXmlTag(xml: string, ...tags: string[]): string {
  for (const tag of tags) {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
    const match = xml.match(regex);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
}

function decodeHtmlEntitiesLocal(value: string): string {
  return value
    .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10) || 0))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16) || 0));
}

async function fetchMusicFromXmlDirect(xmlUrl: string): Promise<{ titulo: string; artista: string; capa: string } | null> {
  try {
    // CEF 86 (vMix browser) does not support AbortSignal.timeout — use AbortController fallback
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const resp = await fetch(xmlUrl, { signal: controller.signal, cache: "no-store" });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const text = await resp.text();
    const titulo = decodeHtmlEntitiesLocal(extractXmlTag(text, "nome_musica", "titulo", "title")).trim();
    const artista = decodeHtmlEntitiesLocal(extractXmlTag(text, "interprete", "nome_interprete", "artista", "artist")).trim();
    const capa = extractXmlTag(text, "capa", "cover", "album_art", "artwork", "imagem").trim();
    if (titulo && titulo !== "Sem título") return { titulo, artista, capa };
    return null;
  } catch { return null; }
}

const weatherIcons: Record<number, string> = { 0:"☀️",1:"🌤️",2:"⛅",3:"☁️",45:"🌫️",48:"🌫️",51:"🌦️",53:"🌦️",55:"🌧️",61:"🌧️",63:"🌧️",65:"🌧️",71:"🌨️",73:"🌨️",75:"🌨️",80:"🌧️",81:"🌧️",82:"🌧️",95:"⛈️",96:"⛈️",99:"⛈️" };
const weatherLabels: Record<number, string> = { 0:"Céu limpo",1:"Parcialmente limpo",2:"Parcialmente nublado",3:"Nublado",45:"Neblina",48:"Neblina",51:"Garoa leve",53:"Garoa",55:"Garoa forte",61:"Chuva leve",63:"Chuva moderada",65:"Chuva forte",71:"Neve leve",73:"Neve",75:"Neve forte",80:"Pancadas leves",81:"Pancadas",82:"Pancadas fortes",95:"Tempestade",96:"Tempestade com granizo",99:"Tempestade severa" };
function getWIcon(code: number) { return weatherIcons[code] ?? weatherIcons[Object.keys(weatherIcons).map(Number).reduce((a, b) => Math.abs(b - code) < Math.abs(a - code) ? b : a)] ?? "🌡️"; }
function getWLabel(code: number) { return weatherLabels[code] ?? weatherLabels[Object.keys(weatherLabels).map(Number).reduce((a, b) => Math.abs(b - code) < Math.abs(a - code) ? b : a)] ?? ""; }

interface LiveWeather {
  current: { temp: number; humidity: number; code: number };
  daily: { date: string; min: number; max: number; code: number; humidity: number; precip: number; rainMm: number; windMax: number }[];
}


const defaultMessages: { user: string; text: string; avatar?: string }[] = [];

const VALID_SCENE_TABS = new Set(["home", "weather", "traffic", "currency", "chat", "enquete"]);
const normalizeSceneTab = (tab: unknown, fallback = "home") =>
  typeof tab === "string" && VALID_SCENE_TABS.has(tab) ? tab : fallback;

export default function CenarioTela() {
  const [chatMessages, setChatMessages] = useState<{ user: string; text: string; avatar?: string }[]>(defaultMessages);
  const [isUpdatingChat, setIsUpdatingChat] = useState(false);
  const { user } = useAuth();
  usePageTitle("NexoHub - CENÁRIO 1");
  const uidFromUrl = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("uid") : null;
  const effectiveUserId = user?.id || uidFromUrl || null;

  const [config, setConfig] = useState<CenarioConfig>(defaultConfig);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [showConnectedMsg, setShowConnectedMsg] = useState(false);
  const presenceShownRef = useRef(false);
  const [backendHealth, setBackendHealth] = useState<"online" | "slow" | "offline">("online");

  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return "home";
    return normalizeSceneTab(new URLSearchParams(window.location.search).get("tab"));
  });

  const [currentChatMessageIdx, setCurrentChatMessageIdx] = useState(0);
  const displayedMessagesRef = useRef<Set<number>>(new Set());

  /* Helper: fetch all cenario data via public edge function (no auth needed) */
  const publicBackoffRef = useRef({ consecutive: 0, BASE: 3000, MAX: 15000 });
  const publicFetchInFlightRef = useRef<Promise<PublicCenarioPayload | null> | null>(null);
  const publicFetchLastResultRef = useRef<PublicCenarioPayload | null>(null);
  const publicFetchLastAtRef = useRef(0);

  const fetchViaEdgeFunction = useCallback(async (uid: string, ytUrl?: string) => {
    if (!uid) return null;

    const nowMs = Date.now();
    if (publicFetchInFlightRef.current) {
      return publicFetchInFlightRef.current;
    }
    const bo = publicBackoffRef.current;
    const jitter = Math.random() * 5000;
    const minGap = Math.min(bo.BASE * Math.pow(2, bo.consecutive), bo.MAX) + jitter;
    const clientCacheWindow = bo.consecutive > 0 ? Math.min(minGap, 12000) : 2500;
    if (publicFetchLastResultRef.current && nowMs - publicFetchLastAtRef.current < clientCacheWindow) {
      return publicFetchLastResultRef.current;
    }

    const request = (async (): Promise<PublicCenarioPayload | null> => {
      try {
        const now = new Date();
        const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
        const day = dayNames[now.getDay()];
        const time = now.toTimeString().slice(0, 5);
        const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-cenario-data?uid=${uid}&day=${encodeURIComponent(day)}&time=${time}${ytUrl ? `&ytUrl=${encodeURIComponent(ytUrl)}` : ""}&_t=${Date.now()}`;
        const resp = await fetch(baseUrl, {
          headers: { "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        });
        if (!resp.ok) {
          bo.consecutive = Math.min(bo.consecutive + 1, 8);
          setBackendHealth(bo.consecutive >= 3 ? "offline" : "slow");
          return publicFetchLastResultRef.current;
        }

        const json = await resp.json();
        if (!json?.ok) {
          bo.consecutive = Math.min(bo.consecutive + 1, 8);
          setBackendHealth(bo.consecutive >= 3 ? "offline" : "slow");
          return publicFetchLastResultRef.current;
        }

        bo.consecutive = 0;
        setBackendHealth("online");
        const parsed = json as PublicCenarioPayload;
        publicFetchLastResultRef.current = parsed;
        publicFetchLastAtRef.current = Date.now();
        return parsed;
      } catch {
        bo.consecutive = Math.min(bo.consecutive + 1, 8);
        setBackendHealth(bo.consecutive >= 3 ? "offline" : "slow");
        return publicFetchLastResultRef.current;
      }
    })();

    publicFetchInFlightRef.current = request;
    try {
      return await request;
    } finally {
      publicFetchInFlightRef.current = null;
    }
  }, []);

  const updateChatMessages = useCallback(async () => {
    if (!effectiveUserId || activeTab !== "chat" || isUpdatingChat) return;
    setIsUpdatingChat(true);
    try {
      const result = await fetchViaEdgeFunction(effectiveUserId);
      if (result?.youtubeChatMessages && result.youtubeChatMessages.length > 0) {
        setChatMessages(prev => {
          const existingKeys = new Set(prev.map(m => `${m.user}:${m.text}`));
          const newOnes = result.youtubeChatMessages!.filter(m => !existingKeys.has(`${m.user}:${m.text}`));
          if (newOnes.length === 0) return prev;
          
          const combined = [...prev, ...newOnes].slice(-50);
          return combined;
        });
      }
    } catch (err) {
      console.error("Error updating chat:", err);
    } finally {
      setIsUpdatingChat(false);
    }
  }, [effectiveUserId, activeTab, isUpdatingChat, fetchViaEdgeFunction]);

  useEffect(() => {
    if (activeTab === "chat") {
      updateChatMessages(); // Initial fetch
      const interval = setInterval(updateChatMessages, 10000); // Poll every 10s
      return () => clearInterval(interval);
    }
  }, [activeTab, updateChatMessages]);

  useEffect(() => {
    if (activeTab === "chat" && chatMessages.length > 0) {
      const interval = setInterval(() => {
        setCurrentChatMessageIdx((prevIdx) => {
          const availableIndices = chatMessages
            .map((_, index) => index)
            .filter((index) => !displayedMessagesRef.current.has(index));

          if (availableIndices.length === 0) {
            displayedMessagesRef.current.clear();
            return (prevIdx + 1) % chatMessages.length;
          }

          const nextIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
          displayedMessagesRef.current.add(nextIndex);
          return nextIndex;
        });
      }, 6000);
      return () => clearInterval(interval);
    }
  }, [activeTab, chatMessages.length]);

  /* ─── Supabase Realtime Presence for "telas conectadas" ─── */
  useEffect(() => {
    if (!effectiveUserId) return;
    let destroyed = false;
    let ch: ReturnType<typeof supabase.channel> | null = null;
    const connect = () => {
      if (destroyed) return;
      ch = supabase.channel(`cenario-presence-${effectiveUserId}-${Date.now()}`, { config: { presence: { key: "tela-externa" } } });
      ch.on("presence", { event: "join" }, ({ key }) => {
        if (key === "painel-controle" && !presenceShownRef.current) {
          presenceShownRef.current = true;
          setShowConnectedMsg(true);
          setTimeout(() => setShowConnectedMsg(false), 4000);
        }
      });
      ch.subscribe(async (status) => {
        if (status === "SUBSCRIBED" && ch) {
          await ch.track({ screen: "tela-externa", ts: Date.now() });
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          // Reconnect after delay
          setTimeout(() => {
            if (!destroyed && ch) { try { supabase.removeChannel(ch); } catch {} }
            connect();
          }, 5000);
        }
      });
    };
    connect();
    return () => { destroyed = true; if (ch) supabase.removeChannel(ch); };
  }, [effectiveUserId]);
  const [weatherSubTab, setWeatherSubTab] = useState(() => {
    if (typeof window === "undefined") return "today";
    const sub = new URLSearchParams(window.location.search).get("weatherSubTab") || "today";
    return sub === "forecast" ? "today" : sub;
  });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentProgram, setCurrentProgram] = useState<{ nome: string; id: string; selo?: string | null; horario_inicio: string; horario_fim: string; apresentador?: string; apresentadorFoto?: string; apresentadoresFotos?: string[]; apresentadorInstagram?: string; tipo_programa?: string | null; thumb?: string | null; capa?: string | null } | null>(null);
  const [presenterIdx, setPresenterIdx] = useState(0);
  const [presenterGradient, setPresenterGradient] = useState<string | null>(null);
  useEffect(() => {
    const fotos = currentProgram?.apresentadoresFotos?.length ? currentProgram.apresentadoresFotos : (currentProgram?.apresentadorFoto ? [currentProgram.apresentadorFoto] : []);
    const activeFoto = fotos[presenterIdx % (fotos.length || 1)] || null;
    if (!activeFoto) { setPresenterGradient(null); return; }
    let cancelled = false;
    extractDominantPair(activeFoto).then(pair => {
      if (cancelled || !pair) return;
      setPresenterGradient(`linear-gradient(145deg, ${pair.primary} 0%, ${pair.secondary} 100%)`);
    });
    return () => { cancelled = true; };
  }, [currentProgram, presenterIdx]);
  const [sponsorLogos, setSponsorLogos] = useState<{ id: string; nome: string; logo_url: string }[]>([]);
  const [sponsorIdx, setSponsorIdx] = useState(0);
  const [liveWeather, setLiveWeather] = useState<LiveWeather | null>(null);
  const [weatherCoords, setWeatherCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [trafficCoords, setTrafficCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [liveCurrencies, setLiveCurrencies] = useState<LiveCurrency[]>([]);
  const [satelliteZoom, setSatelliteZoom] = useState(6);
  const [musicData, setMusicData] = useState<{ titulo: string; artista: string; capa: string; duracao?: number } | null>(null);
  const [musicKey, setMusicKey] = useState(0);
  const prevMusicRef = useRef("");
  const musicStartRef = useRef<number>(Date.now());
  const [musicElapsed, setMusicElapsed] = useState(0);
  const [nextProgram, setNextProgram] = useState<{ nome: string; selo?: string | null; horario_inicio: string; horario_fim: string } | null>(null);
  const [enquetes, setEnquetes] = useState<any[]>([]);

  const musicXmlUrlRef = useRef<string | null>(null);

  /* ─── Artist background image (Deezer) — same logic as Player audio ─── */
  const [artistBgUrl, setArtistBgUrl] = useState<string | null>(null);
  const artistBgCacheRef = useRef<Record<string, string>>({});
  const [prevArtistBgUrl, setPrevArtistBgUrl] = useState<string | null>(null);
  const [artistBgReady, setArtistBgReady] = useState(false);
  useEffect(() => {
    if (artistBgUrl) setPrevArtistBgUrl(artistBgUrl);
  }, [artistBgUrl]);

  /* ─── Alternate background mode: absolute 10s slots, stable in vMix/CEF ─── */
  const altBgPhase: "artist" | "thumb" = config.bgAlternateMode && Math.floor(currentTime.getTime() / 10000) % 2 === 1 ? "thumb" : "artist";

  /* ─── User accent color (from layout settings) ─── */
  const [accentColor, setAccentColor] = useState("#444444");
  const accentRgba = (alpha: number) => {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(accentColor);
    if (!m) return `rgba(68,68,68,${alpha})`;
    return `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${alpha})`;
  };
  const [debugMode, setDebugMode] = useState(false);
  const [showArtistLayer, setShowArtistLayer] = useState(true);
  const [showThumbLayer, setShowThumbLayer] = useState(false);

  /* ─── Fetch artist background from Deezer (like Player audio) ─── */
  const exceptionWordsList = (config.home.exceptionWords || "break,vinhetas,hora certa").split(",").map(w => w.trim().toLowerCase()).filter(Boolean);
  const isNoPlayback = [musicData?.titulo, musicData?.artista].some(value => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes("sem reproducao"));
  const isBreakTrack = (() => {
    const titulo = (musicData?.titulo || "").toLowerCase();
    const artista = (musicData?.artista || "").toLowerCase();
    return exceptionWordsList.some(w => titulo === w || artista === w || titulo.includes(w) || artista.includes(w));
  })();
  const isJornalistico = currentProgram?.tipo_programa?.toLowerCase() === "jornalístico" || currentProgram?.tipo_programa?.toLowerCase() === "jornalistico";
  useEffect(() => {
    if (isBreakTrack || isJornalistico || isNoPlayback) { setArtistBgUrl(null); setPrevArtistBgUrl(null); setArtistBgReady(false); return; }
    const artist = musicData?.artista;
    if (!artist || artist === "Desconhecido") { setArtistBgUrl(null); setPrevArtistBgUrl(null); setArtistBgReady(false); return; }
    const cacheKey = artist.toLowerCase();
    if (artistBgCacheRef.current[cacheKey]) {
      setArtistBgReady(false);
      setArtistBgUrl(artistBgCacheRef.current[cacheKey]);
      return;
    }
    setArtistBgReady(false);
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("fetch-artist-image", {
          body: { artist },
        });
        if (cancelled) return;
        if (error || !data?.ok || !data?.url) { setArtistBgUrl(null); return; }
        artistBgCacheRef.current[cacheKey] = data.url;
        setArtistBgUrl(data.url);
      } catch { if (!cancelled) setArtistBgUrl(null); }
    })();
    return () => { cancelled = true; };
  }, [musicData?.artista, isBreakTrack, isJornalistico, isNoPlayback]);

  /* ─── Screen Rotation ─── */
  const [screenRotation, setScreenRotation] = useState(0);

  /* ─── Drawing (Pen) ─── */
  const [drawingActive, setDrawingActive] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [drawColor, setDrawColor] = useState("#ff3b3b");
  const [drawWidth, setDrawWidth] = useState(3);
  const [showDrawOptions, setShowDrawOptions] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const DRAW_COLORS = ["#ff3b3b", "#3b82f6", "#4ade80", "#f59e0b", "#ffffff", "#e1f532"];
  const DRAW_WIDTHS = [2, 4, 8, 14];

  const cenarioBcDrawRef = useRef<BroadcastChannel | null>(null);
  const rtDrawChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const getCanvasPos = useCallback((e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return { x: clientX - rect.left, y: clientY - rect.top, px: (clientX - rect.left) / rect.width, py: (clientY - rect.top) / rect.height };
  }, []);

  const drawOnCanvas = useCallback((canvas: HTMLCanvasElement, action: string, px: number, py: number, color: string, width: number) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const x = px * canvas.width;
    const y = py * canvas.height;
    if (action === "start") { ctx.beginPath(); ctx.moveTo(x, y); }
    else if (action === "move") {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.lineTo(x, y); ctx.stroke();
    }
  }, []);

  const drawShapeOnCanvas = useCallback((canvas: HTMLCanvasElement, shape: string, startPx: number, startPy: number, endPx: number, endPy: number, color: string, width: number) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const sx = startPx * canvas.width, sy = startPy * canvas.height;
    const ex = endPx * canvas.width, ey = endPy * canvas.height;
    const w = ex - sx, h = ey - sy;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    switch (shape) {
      case "square": ctx.rect(sx, sy, w, h); break;
      case "circle": { const rx = Math.abs(w)/2, ry = Math.abs(h)/2; ctx.ellipse(sx+w/2, sy+h/2, rx, ry, 0, 0, Math.PI*2); break; }
      case "triangle": ctx.moveTo(sx+w/2,sy); ctx.lineTo(sx+w,sy+h); ctx.lineTo(sx,sy+h); ctx.closePath(); break;
      case "diamond": ctx.moveTo(sx+w/2,sy); ctx.lineTo(sx+w,sy+h/2); ctx.lineTo(sx+w/2,sy+h); ctx.lineTo(sx,sy+h/2); ctx.closePath(); break;
      case "star": { const cx=sx+w/2,cy=sy+h/2,oR=Math.min(Math.abs(w),Math.abs(h))/2,iR=oR*0.4; for(let i=0;i<10;i++){const r=i%2===0?oR:iR,a=(Math.PI/5)*i-Math.PI/2;const px=cx+r*Math.cos(a),py=cy+r*Math.sin(a);if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}ctx.closePath();break;}
      case "arrow-up": { const cx=sx+w/2; ctx.moveTo(cx,sy);ctx.lineTo(sx+w,sy+h*0.4);ctx.moveTo(cx,sy);ctx.lineTo(sx,sy+h*0.4);ctx.moveTo(cx,sy);ctx.lineTo(cx,sy+h);break;}
      case "arrow-right": { const cy=sy+h/2; ctx.moveTo(sx+w,cy);ctx.lineTo(sx+w*0.6,sy);ctx.moveTo(sx+w,cy);ctx.lineTo(sx+w*0.6,sy+h);ctx.moveTo(sx+w,cy);ctx.lineTo(sx,cy);break;}
      case "arrow-down": { const cx=sx+w/2; ctx.moveTo(cx,sy+h);ctx.lineTo(sx+w,sy+h*0.6);ctx.moveTo(cx,sy+h);ctx.lineTo(sx,sy+h*0.6);ctx.moveTo(cx,sy+h);ctx.lineTo(cx,sy);break;}
      case "arrow-left": { const cy=sy+h/2; ctx.moveTo(sx,cy);ctx.lineTo(sx+w*0.4,sy);ctx.moveTo(sx,cy);ctx.lineTo(sx+w*0.4,sy+h);ctx.moveTo(sx,cy);ctx.lineTo(sx+w,cy);break;}
    }
    ctx.stroke();
  }, []);

  /* Supabase Realtime draw channel (cross-device) */
  useEffect(() => {
    if (!effectiveUserId) return;
    let destroyed = false;
    let ch: ReturnType<typeof supabase.channel> | null = null;
    const connect = () => {
      if (destroyed) return;
      ch = supabase.channel(`draw-sync-${effectiveUserId}`);
      ch.on("broadcast", { event: "draw" }, ({ payload }: any) => {
        const canvas = canvasRef.current;
        if (canvas && payload) {
          drawOnCanvas(canvas, payload.action, payload.px, payload.py, payload.color, payload.width);
          if (payload.action === "move") setHasDrawing(true);
        }
      }).on("broadcast", { event: "draw-clear" }, () => {
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          setHasDrawing(false);
        }
      }).on("broadcast", { event: "draw-shape" }, ({ payload }: any) => {
        const canvas = canvasRef.current;
        if (canvas && payload) {
          drawShapeOnCanvas(canvas, payload.shape, payload.startPx, payload.startPy, payload.endPx, payload.endPy, payload.color, payload.width);
          setHasDrawing(true);
        }
      }).on("broadcast", { event: "zoom-change" }, ({ payload }: any) => {
        if (payload && typeof payload.zoom === "number") setSatelliteZoom(payload.zoom);
      }).on("broadcast", { event: "tab-change" }, ({ payload }: any) => {
        if (payload?.tab) setActiveTab(normalizeSceneTab(payload.tab, activeTab));
        if (payload?.subTab) setWeatherSubTab(payload.subTab);
        if (payload?.currencySubTab) setCurrencySubTab(payload.currencySubTab);
      }).on("broadcast", { event: "rotate" }, ({ payload }: any) => {
        if (payload && typeof payload.angle === "number") setScreenRotation(payload.angle);
      }).on("broadcast", { event: "config-update" }, ({ payload }: any) => {
      if (payload?.config && typeof payload.config === "object") {
        // Clear chat if youtubeVideoUrl changed
        if (payload.config.chat?.youtubeVideoUrl && payload.config.chat.youtubeVideoUrl !== config.chat.youtubeVideoUrl) {
          setChatMessages([]);
        }
        setConfig(prev => ({ ...prev, ...(payload.config as Partial<CenarioConfig>) }));
          setLastSyncTime(new Date());
          setBackendHealth("online");
        }
      }).on("broadcast", { event: "element-move" }, ({ payload }: any) => {
        if (payload?.id && payload?.pos) {
          setConfig(prev => ({
            ...prev,
            home: {
              ...prev.home,
              elementPositions: { ...prev.home.elementPositions, [payload.id]: payload.pos }
            }
          }));
        }
      }).subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setTimeout(() => {
            if (!destroyed && ch) { try { supabase.removeChannel(ch); } catch {} }
            connect();
          }, 5000);
        }
      });
      rtDrawChannelRef.current = ch;
    };
    connect();
    return () => { destroyed = true; if (ch) supabase.removeChannel(ch); rtDrawChannelRef.current = null; };
  }, [effectiveUserId, drawOnCanvas]);

  const sendDraw = useCallback((action: string, px: number, py: number, color: string, width: number) => {
    cenarioBcDrawRef.current?.postMessage({ type: "draw", action, px, py, color, width });
    rtDrawChannelRef.current?.send({ type: "broadcast", event: "draw", payload: { action, px, py, color, width } });
  }, []);

  const sendDrawClear = useCallback(() => {
    cenarioBcDrawRef.current?.postMessage({ type: "draw-clear" });
    rtDrawChannelRef.current?.send({ type: "broadcast", event: "draw-clear", payload: {} });
  }, []);

  const handleDrawStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !drawingActive) return;
    e.preventDefault();
    isDrawingRef.current = true;
    const pos = getCanvasPos(e, canvas);
    drawOnCanvas(canvas, "start", pos.px, pos.py, drawColor, drawWidth);
    sendDraw("start", pos.px, pos.py, drawColor, drawWidth);
  }, [drawingActive, getCanvasPos, drawColor, drawWidth, drawOnCanvas, sendDraw]);

  const handleDrawMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas || !isDrawingRef.current) return;
    e.preventDefault();
    const pos = getCanvasPos(e, canvas);
    drawOnCanvas(canvas, "move", pos.px, pos.py, drawColor, drawWidth);
    setHasDrawing(true);
    sendDraw("move", pos.px, pos.py, drawColor, drawWidth);
  }, [getCanvasPos, drawColor, drawWidth, drawOnCanvas, sendDraw]);

  const handleDrawEnd = useCallback(() => {
    isDrawingRef.current = false;
    sendDraw("end", 0, 0, "", 0);
  }, [sendDraw]);

  const clearDrawing = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawing(false);
    sendDrawClear();
  }, [sendDrawClear]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const resize = () => { canvas.width = parent.clientWidth; canvas.height = parent.clientHeight; };
    resize();
    // ResizeObserver fallback for vMix's older Chromium
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(resize);
      ro.observe(parent);
      return () => ro.disconnect();
    } else {
      window.addEventListener("resize", resize);
      return () => window.removeEventListener("resize", resize);
    }
  }, []);

  const [currencySubTab, setCurrencySubTab] = useState<"moedas" | "bolsas">("moedas");
  const [liveStocks, setLiveStocks] = useState<LiveStock[]>([]);

  /* Fetch live currencies */
  useEffect(() => {
    if (!config.currency.enabled || !config.currency.currencies.length) return;
    let cancelled = false;
    const load = async () => {
      const data = await fetchLiveCurrencies(config.currency.currencies);
      if (!cancelled) setLiveCurrencies(data);
    };
    load();
    const interval = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [config.currency.enabled, config.currency.currencies.join(",")]);

  /* Fetch live stocks */
  useEffect(() => {
    if (!config.currency.enabled) return;
    let cancelled = false;
    const load = async () => {
      const data = await fetchLiveStocks();
      if (!cancelled) setLiveStocks(data);
    };
    load();
    const interval = setInterval(load, 120000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [config.currency.enabled]);

  /* Clock */
  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  /* Sponsor logo cycling */
  useEffect(() => {
    if (sponsorLogos.length <= 1) { setSponsorIdx(0); return; }
    const t = setInterval(() => setSponsorIdx(prev => (prev + 1) % sponsorLogos.length), 5000);
    return () => clearInterval(t);
  }, [sponsorLogos.length]);

  /* Music elapsed time ticker */
  useEffect(() => {
    if (!musicData) return;
    const t = setInterval(() => {
      setMusicElapsed(Math.floor((Date.now() - musicStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [musicData, musicKey]);

  /* Load cached config first (works even without auth token in new tab) */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("cenario_interativo_config_cache_v1");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object") {
        const { _activeTab, _weatherSubTab, _currencySubTab, _screenRotation, ...rest } = parsed;
        setConfig(prev => ({ ...prev, ...rest }));
        if (_activeTab) setActiveTab(normalizeSceneTab(_activeTab));
        if (_weatherSubTab) setWeatherSubTab(_weatherSubTab);
        if (_currencySubTab) setCurrencySubTab(_currencySubTab);
        if (typeof _screenRotation === "number") setScreenRotation(_screenRotation);
      }
    } catch {
      // silent
    }
  }, []);


  /* Load config from DB + subscribe to realtime changes */
  const initialTabLoaded = useRef(false);
  const isAuthenticated = !!user;
  useEffect(() => {
    if (!effectiveUserId) return;

    const applyConfig = (raw: any, fromRealtime = false) => {
      if (!raw || typeof raw !== "object" || Object.keys(raw).length === 0) return;
      const { _activeTab, _weatherSubTab, _currencySubTab, _screenRotation, ...rest } = raw;
      const merged = { ...defaultConfig, ...rest };
      setConfig(merged);
      // Only apply tab/rotation from initial load, never from realtime updates
      // Tab changes arrive via explicit "tab-change" broadcast events instead
      if (!fromRealtime) {
        if (_activeTab) setActiveTab(normalizeSceneTab(_activeTab));
        if (_weatherSubTab) setWeatherSubTab(_weatherSubTab);
        if (_currencySubTab) setCurrencySubTab(_currencySubTab);
        if (typeof _screenRotation === "number") setScreenRotation(_screenRotation);
      }
      if (fromRealtime) setLastSyncTime(new Date());
      try {
        localStorage.setItem("cenario_interativo_config_cache_v1", JSON.stringify({ ...merged, _activeTab, _weatherSubTab, _currencySubTab, _screenRotation }));
      } catch { /* silent */ }
    };

    const load = async () => {
      if (isAuthenticated) {
        const { data } = await supabase.from("user_settings").select("cenario_config" as any).eq("user_id", effectiveUserId).maybeSingle();
        if ((data as any)?.cenario_config) {
          applyConfig((data as any).cenario_config);
        }
      } else {
        // Unauthenticated (vMix browser, etc): use edge function
        const result = await fetchViaEdgeFunction(effectiveUserId, config.chat?.youtubeVideoUrl);
        if (result?.cenario_config) applyConfig(result.cenario_config);
        if (result?.accentColor) setAccentColor(result.accentColor);
        if (result?.youtubeChatMessages && result.youtubeChatMessages.length > 0) {
          setChatMessages(result.youtubeChatMessages);
        } else if (result?.ok) {
          setChatMessages([]);
        }
        if (result?.currentProgram) {
          setCurrentProgram(result.currentProgram);
          setSponsorLogos(result.sponsorLogos || []);
          setNextProgram(result.nextProgram || null);
        } else {
          setCurrentProgram(null);
          setSponsorLogos([]);
          setNextProgram(null);
        }

        // Store XML URL for direct browser-side fallback
        if (result?.musicXmlUrl) musicXmlUrlRef.current = result.musicXmlUrl;

        if (result?.musicData?.titulo && result.musicData.titulo !== "Sem título") {
          if (setMusicWithCoverFallbackRef.current) {
            void setMusicWithCoverFallbackRef.current(
              result.musicData.titulo,
              result.musicData.artista || "",
              result.musicData.capa || "",
              undefined,
              result.musicStartTime || null
            );
          } else {
            // Ref not ready yet (race condition) — set state directly
            const t = result.musicData.titulo, a = result.musicData.artista || "", c = result.musicData.capa || "";
            prevMusicRef.current = `${t}|${a}`;
            musicStartRef.current = result.musicStartTime || Date.now();
            setMusicData({ titulo: t, artista: a, capa: c });
            setMusicKey(k => k + 1);
            if (!c) fetchItunesCover(t, a).then(fc => { if (fc && prevMusicRef.current === `${t}|${a}`) setMusicData(prev => prev ? { ...prev, capa: fc } : prev); });
          }
        } else if (result?.musicXmlUrl) {
          // Edge function couldn't fetch XML (e.g. local network) — try directly from browser
          const directMusic = await fetchMusicFromXmlDirect(result.musicXmlUrl);
          if (directMusic) {
            if (setMusicWithCoverFallbackRef.current) {
              void setMusicWithCoverFallbackRef.current(directMusic.titulo, directMusic.artista, directMusic.capa, undefined, null);
            } else {
              const t = directMusic.titulo, a = directMusic.artista, c = directMusic.capa;
              prevMusicRef.current = `${t}|${a}`;
              musicStartRef.current = Date.now();
              setMusicData({ titulo: t, artista: a, capa: c });
              setMusicKey(k => k + 1);
              if (!c) fetchItunesCover(t, a).then(fc => { if (fc && prevMusicRef.current === `${t}|${a}`) setMusicData(prev => prev ? { ...prev, capa: fc } : prev); });
            }
          }
        }
      }
    };
    load();

    // Realtime subscription for cross-computer sync
    let destroyed = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    const connectSync = () => {
      if (destroyed) return;
      channel = supabase
        .channel(`cenario-sync-${effectiveUserId}-${Date.now()}`)
        .on(
          "postgres_changes" as any,
          {
            event: "UPDATE",
            schema: "public",
            table: "user_settings",
            filter: `user_id=eq.${effectiveUserId}`,
          },
          (payload: any) => {
            const newConfig = payload.new?.cenario_config;
            if (newConfig) applyConfig(newConfig, true);
          }
        )
        .subscribe((status) => {
          setRealtimeConnected(status === "SUBSCRIBED");
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            setRealtimeConnected(false);
            setTimeout(() => {
              if (!destroyed && channel) { try { supabase.removeChannel(channel); } catch {} }
              connectSync();
            }, 5000);
          }
        });
    };
    connectSync();

    // Fallback forte para navegador do vMix: polling curto da config pública
    let pollTimer: ReturnType<typeof setTimeout> | null = null;
    let pollingPublic = false;
    if (!isAuthenticated) {
      const schedulePoll = () => {
        const bo = publicBackoffRef.current;
        const delay = Math.min(bo.BASE * Math.pow(2, bo.consecutive), bo.MAX) + Math.random() * 5000;
        pollTimer = setTimeout(doPoll, delay);
      };
      const doPoll = async () => {
        if (destroyed) return;
        if (pollingPublic) return;
        pollingPublic = true;
        try {
          const result = await fetchViaEdgeFunction(effectiveUserId, config.chat?.youtubeVideoUrl);
          if (result?.cenario_config) applyConfig(result.cenario_config);
          if (result?.accentColor) setAccentColor(result.accentColor);
          if (result?.youtubeChatMessages && result.youtubeChatMessages.length > 0) {
            setChatMessages(result.youtubeChatMessages);
          } else if (result?.ok) {
            setChatMessages([]);
          }
          if (result?.currentProgram) {
            setCurrentProgram(result.currentProgram);
            setSponsorLogos(result.sponsorLogos || []);
            setNextProgram(result.nextProgram || null);
            if (result.enquetes) setEnquetes(result.enquetes);
          }
          if (result?.musicXmlUrl) musicXmlUrlRef.current = result.musicXmlUrl;
          if (result?.musicData?.titulo && result.musicData.titulo !== "Sem título") {
            const fn = setMusicWithCoverFallbackRef.current;
            if (fn) {
              void fn(result.musicData.titulo, result.musicData.artista || "", result.musicData.capa || "", undefined, result.musicStartTime || null);
            } else {
              const t = result.musicData.titulo, a = result.musicData.artista || "", c = result.musicData.capa || "";
              prevMusicRef.current = `${t}|${a}`;
              musicStartRef.current = result.musicStartTime || Date.now();
              setMusicData({ titulo: t, artista: a, capa: c });
              setMusicKey(k => k + 1);
              if (!c) fetchItunesCover(t, a).then(fc => { if (fc && prevMusicRef.current === `${t}|${a}`) setMusicData(prev => prev ? { ...prev, capa: fc } : prev); });
            }
          } else {
            // Fallback: fetch XML directly from browser (works for local network XMLs)
            const xmlUrl = result?.musicXmlUrl || musicXmlUrlRef.current;
            if (xmlUrl) {
              const directMusic = await fetchMusicFromXmlDirect(xmlUrl);
              if (directMusic) {
                const fn = setMusicWithCoverFallbackRef.current;
                if (fn) {
                  void fn(directMusic.titulo, directMusic.artista, directMusic.capa, undefined, null);
                } else {
                  const t = directMusic.titulo, a = directMusic.artista, c = directMusic.capa;
                  prevMusicRef.current = `${t}|${a}`;
                  musicStartRef.current = Date.now();
                  setMusicData({ titulo: t, artista: a, capa: c });
                  setMusicKey(k => k + 1);
                  if (!c) fetchItunesCover(t, a).then(fc => { if (fc && prevMusicRef.current === `${t}|${a}`) setMusicData(prev => prev ? { ...prev, capa: fc } : prev); });
                }
              }
            }
          }
        } finally {
          pollingPublic = false;
          if (!destroyed) schedulePoll();
        }
      };
      schedulePoll();
    }

    return () => { destroyed = true; setRealtimeConnected(false); if (channel) supabase.removeChannel(channel); if (pollTimer) clearTimeout(pollTimer); };
  }, [effectiveUserId, isAuthenticated, fetchViaEdgeFunction]);

  /* Keep cache synced — handled entirely by applyConfig, remove standalone sync to avoid overwriting _screenRotation etc */

  /* Fetch current program + sponsor logos */
  useEffect(() => {
    if (!effectiveUserId || !isAuthenticated) return;
    const load = async () => {
      const now = new Date();
      const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
      const today = dayNames[now.getDay()];
      const nowTime = now.toTimeString().slice(0, 5);
      const { data: progs } = await supabase.from("programas").select("id, nome, selo, horario_inicio, horario_fim, dias_semana, apresentador_id, apresentadores_ids, tipo_programa, thumb, capa").eq("user_id", effectiveUserId).eq("ativo", true);
      const onAir = progs?.find(p => (p.dias_semana || []).includes(today) && p.horario_inicio <= nowTime && p.horario_fim > nowTime);
      if (onAir) {
        let apresentadorNome = "";
        let apresentadorFoto = "";
        let apresentadoresFotos: string[] = [];
        const apIds = onAir.apresentadores_ids?.length ? onAir.apresentadores_ids : onAir.apresentador_id ? [onAir.apresentador_id] : [];
        if (apIds.length) {
          const { data: aps } = await supabase.from("apresentadores").select("nome, foto").in("id", apIds);
          apresentadorNome = aps?.map(a => a.nome).join(", ") || "";
          apresentadoresFotos = (aps || []).map(a => a.foto).filter((f): f is string => !!f);
          apresentadorFoto = apresentadoresFotos[0] || "";
        }
        setCurrentProgram({ nome: onAir.nome, id: onAir.id, selo: onAir.selo, horario_inicio: onAir.horario_inicio, horario_fim: onAir.horario_fim, apresentador: apresentadorNome, apresentadorFoto, apresentadoresFotos, tipo_programa: onAir.tipo_programa, thumb: (onAir as any).thumb, capa: (onAir as any).capa });
        const { data: logos } = await supabase.from("logos_patrocinadores").select("id, nome, logo_url").eq("programa_id", onAir.id).eq("user_id", effectiveUserId).eq("ativo", true).eq("excluido", false);
        setSponsorLogos(logos || []);
        // Find next program
        const upcoming = progs?.filter(p => (p.dias_semana || []).includes(today) && p.horario_inicio > nowTime).sort((a, b) => a.horario_inicio.localeCompare(b.horario_inicio));
        if (upcoming?.length) {
          const np = upcoming[0];
          setNextProgram({ nome: np.nome, selo: np.selo, horario_inicio: np.horario_inicio, horario_fim: np.horario_fim });
        } else {
          setNextProgram(null);
        }
      } else { setCurrentProgram(null); setSponsorLogos([]); setNextProgram(null); }
    };
    load();
    const interval = setInterval(load, 60000);
    return () => clearInterval(interval);
  }, [effectiveUserId, isAuthenticated]);

  /* Rotate presenter photo every 10s when program has multiple presenters */
  useEffect(() => {
    const fotos = currentProgram?.apresentadoresFotos || [];
    setPresenterIdx(0);
    if (fotos.length <= 1) return;
    const id = setInterval(() => {
      setPresenterIdx(i => (i + 1) % fotos.length);
    }, 10000);
    return () => clearInterval(id);
  }, [currentProgram?.id, currentProgram?.apresentadoresFotos?.join("|")]);

  /* Fetch weather — initial + every 5 min to stay in sync with XML */
  const weatherCity = config.weather.city || config.city;
  const weatherCoordsRef = useRef<{ lat: number; lon: number } | null>(null);
  useEffect(() => {
    if (!weatherCity) return;
    let cancelled = false;

    const doFetch = async () => {
      try {
        let lat = weatherCoordsRef.current?.lat;
        let lon = weatherCoordsRef.current?.lon;
        if (!lat || !lon) {
          const { data: geoData } = await supabase.functions.invoke("fetch-weather", { body: { action: "geocode", query: weatherCity, count: 1 } });
          const results = geoData?.results;
          if (!results?.length) return;
          lat = results[0].latitude;
          lon = results[0].longitude;
          weatherCoordsRef.current = { lat, lon };
          if (!cancelled) setWeatherCoords({ lat, lon });
        }
        if (config.weather.enabled) {
          const { data: forecastData } = await supabase.functions.invoke("fetch-weather", { body: { action: "forecast", lat, lon, forecast_days: 5 } });
          if (!cancelled && forecastData?.ok && forecastData.data) {
            const d = forecastData.data;
            setLiveWeather({
              current: { temp: Math.round(d.current?.temperature_2m ?? 0), humidity: Math.round(d.current?.relative_humidity_2m ?? 0), code: d.current?.weather_code ?? 0 },
              daily: (d.daily?.time || []).map((date: string, i: number) => ({ date, min: Math.round(d.daily.temperature_2m_min?.[i] ?? 0), max: Math.round(d.daily.temperature_2m_max?.[i] ?? 0), code: d.daily.weather_code?.[i] ?? 0, humidity: Math.round(d.daily.relative_humidity_2m_max?.[i] ?? 0), precip: Math.round(d.daily.precipitation_probability_max?.[i] ?? 0), rainMm: Math.round((d.daily.precipitation_sum?.[i] ?? 0) * 10) / 10, windMax: Math.round(d.daily.wind_speed_10m_max?.[i] ?? 0) })),
            });
          }
        }
      } catch { /* silent */ }
    };

    // Initial fetch after 500ms debounce
    const initTimer = setTimeout(doFetch, 500);
    // Re-fetch every 5 minutes to stay in sync with the XML feed
    const interval = setInterval(doFetch, 5 * 60 * 1000);

    return () => { cancelled = true; clearTimeout(initTimer); clearInterval(interval); weatherCoordsRef.current = null; };
  }, [config.weather.enabled, weatherCity, config.weather.showSatellite]);

  /* Geocode traffic */
  const trafficCity = config.traffic.city || config.city;
  useEffect(() => {
    if (!config.traffic.enabled) { setTrafficCoords(null); return; }
    // Use config lat/lon if available (synced from config page)
    if (config.traffic.lat != null && config.traffic.lon != null) {
      setTrafficCoords({ lat: config.traffic.lat, lon: config.traffic.lon });
      return;
    }
    // Fallback: geocode from city name
    if (!trafficCity) { setTrafficCoords(null); return; }
    const t = setTimeout(async () => {
      try {
        const { data: geoData } = await supabase.functions.invoke("fetch-weather", { body: { action: "geocode", query: trafficCity, count: 1 } });
        if (geoData?.results?.length) setTrafficCoords({ lat: geoData.results[0].latitude, lon: geoData.results[0].longitude });
      } catch { /* silent */ }
    }, 500);
    return () => clearTimeout(t);
  }, [config.traffic.enabled, trafficCity, config.traffic.lat, config.traffic.lon]);

  /* ─── Fetch iTunes cover when capa is missing ─── */
  const fetchItunesCover = useCallback(async (titulo: string, artista: string): Promise<string> => {
    try {
      const q = `${artista} ${titulo}`.trim();
      if (!q) return "";
      const resp = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&limit=1`);
      const data = await resp.json();
      if (data?.results?.[0]?.artworkUrl100) {
        return data.results[0].artworkUrl100.replace("100x100", "600x600");
      }
    } catch { /* silent */ }
    return "";
  }, []);

  /* ─── Music sync: Realtime + localStorage listener + fallback polling ─── */
  const setMusicWithCoverFallbackRef = useRef<(titulo: string, artista: string, capa: string, duracao?: number, startTime?: number | null) => Promise<void>>();
  
  useEffect(() => {
    const setMusicWithCoverFallback = async (titulo: string, artista: string, capa: string, duracao?: number, startTime?: number | null) => {
      const key = `${titulo}|${artista}`;
      const normalizedStartTime = startTime || Date.now();
      const sameTrack = key === prevMusicRef.current;

      if (sameTrack) {
        if (startTime && normalizedStartTime !== musicStartRef.current) {
          musicStartRef.current = normalizedStartTime;
          setMusicElapsed(Math.max(0, Math.floor((Date.now() - normalizedStartTime) / 1000)));
          setMusicKey((k) => k + 1);
        }

        if (capa) {
          setMusicData((prev) => {
            if (!prev || prev.titulo !== titulo || prev.artista !== artista || prev.capa === capa) {
              return prev;
            }
            return { ...prev, capa };
          });
        }
        return;
      }

      prevMusicRef.current = key;
      musicStartRef.current = normalizedStartTime;
      setMusicElapsed(startTime ? Math.floor((Date.now() - normalizedStartTime) / 1000) : 0);
      setMusicData({ titulo, artista, capa: capa || "", duracao });
      setMusicKey((k) => k + 1);

      if (!capa) {
        const fetchedCapa = await fetchItunesCover(titulo, artista);
        if (!fetchedCapa || prevMusicRef.current !== key) return;
        setMusicData((prev) => {
          if (!prev || prev.titulo !== titulo || prev.artista !== artista || prev.capa === fetchedCapa) {
            return prev;
          }
          return { ...prev, capa: fetchedCapa };
        });
      }
    };
    setMusicWithCoverFallbackRef.current = setMusicWithCoverFallback;

    // ─── 1. localStorage listener — SCOPED to effectiveUserId ───
    // CRITICAL: We MUST NOT read the legacy unscoped key `masterview_music_data`
    // — it is written by Player.tsx running for ANY user in the same browser
    // (e.g. Positiva FM's Player writes "Last Nite - The Strokes" to that key)
    // and would overwrite the correct music every 1.5s poll for a different
    // slug (e.g. Jornal FM on Tela Interativa).
    const SCOPED_DATA_KEY = musicDataKey(effectiveUserId);
    const SCOPED_START_KEY = musicStartKey(effectiveUserId);
    const onStorage = (e: StorageEvent) => {
      if (!SCOPED_DATA_KEY || e.key !== SCOPED_DATA_KEY || !e.newValue) return;
      try {
        const d = JSON.parse(e.newValue) as { titulo?: string; artista?: string; capa?: string; duracao?: number };
        if (d.titulo && d.titulo !== "Sem título") {
          const startRaw = SCOPED_START_KEY ? localStorage.getItem(SCOPED_START_KEY) : null;
          const startTime = startRaw ? parseInt(startRaw, 10) : null;
          setMusicWithCoverFallback(d.titulo || "", d.artista || "", d.capa || "", d.duracao, startTime);
        }
      } catch { /* silent */ }
    };
    window.addEventListener("storage", onStorage);
    // Same-tab custom event fired by writeMusicData (storage event only fires cross-tab)
    const onSameTabMusic = (evt: Event) => {
      const ce = evt as CustomEvent<{ userId?: string; data?: { titulo?: string; artista?: string; capa?: string; duracao?: number } }>;
      if (!ce.detail || ce.detail.userId !== effectiveUserId) return;
      const d = ce.detail.data;
      if (d?.titulo && d.titulo !== "Sem título") {
        const startRaw = SCOPED_START_KEY ? localStorage.getItem(SCOPED_START_KEY) : null;
        const startTime = startRaw ? parseInt(startRaw, 10) : null;
        setMusicWithCoverFallback(d.titulo || "", d.artista || "", d.capa || "", d.duracao, startTime);
      }
    };
    window.addEventListener(MUSIC_DATA_EVENT, onSameTabMusic);

    // Also read initial value from the SCOPED key (never the legacy one)
    try {
      const raw = SCOPED_DATA_KEY ? localStorage.getItem(SCOPED_DATA_KEY) : null;
      if (raw) {
        const d = JSON.parse(raw) as { titulo?: string; artista?: string; capa?: string; duracao?: number };
        if (d.titulo && d.titulo !== "Sem título") {
          const startRaw = SCOPED_START_KEY ? localStorage.getItem(SCOPED_START_KEY) : null;
          const startTime = startRaw ? parseInt(startRaw, 10) : null;
          setMusicWithCoverFallback(d.titulo || "", d.artista || "", d.capa || "", d.duracao, startTime);
        }
      }
    } catch { /* silent */ }

    // ─── 2. Supabase Realtime subscription on user_settings (cross-device, instant) ───
    let realtimeCh: ReturnType<typeof supabase.channel> | null = null;
    let destroyed = false;

    if (effectiveUserId) {
      const connectRealtime = () => {
        if (destroyed) return;
        realtimeCh = supabase
          .channel(`music-rt-${effectiveUserId}-${Date.now()}`)
          .on(
            "postgres_changes" as any,
            {
              event: "UPDATE",
              schema: "public",
              table: "user_settings",
              filter: `user_id=eq.${effectiveUserId}`,
            },
            (payload: any) => {
              const items = payload.new?.dashboard_items as Record<string, any> | null;
              if (items?.music_current_title && items.music_current_title !== "Sem título") {
                setMusicWithCoverFallback(
                  items.music_current_title,
                  items.music_current_artist || "",
                  items.music_current_cover || "",
                  undefined,
                  items.music_start_time || null
                );
              }
            }
          )
          .subscribe((status) => {
            if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
              setTimeout(() => {
                if (!destroyed && realtimeCh) { try { supabase.removeChannel(realtimeCh); } catch {} }
                connectRealtime();
              }, 5000);
            }
          });
      };
      connectRealtime();

      // ─── 3. Initial fetch from DB ───
      (async () => {
        try {
          if (isAuthenticated) {
            const { data: settings } = await supabase
              .from("user_settings")
              .select("dashboard_items")
              .eq("user_id", effectiveUserId)
              .maybeSingle();
            const items = (settings?.dashboard_items as Record<string, any>) || {};
            // Load user accent color
            if (items.layout_colors?.accentColor) {
              setAccentColor(items.layout_colors.accentColor);
            }
            if (items.music_current_title && items.music_current_title !== "Sem título") {
              await setMusicWithCoverFallback(items.music_current_title, items.music_current_artist || "", items.music_current_cover || "", undefined, items.music_start_time || null);
            }
          } else {
            const result = await fetchViaEdgeFunction(effectiveUserId);
            if (result?.accentColor) setAccentColor(result.accentColor);
            if (result?.musicXmlUrl) musicXmlUrlRef.current = result.musicXmlUrl;
            if (result?.musicData?.titulo && result.musicData.titulo !== "Sem título") {
              await setMusicWithCoverFallback(result.musicData.titulo, result.musicData.artista, result.musicData.capa || "", undefined, result.musicStartTime);
            } else if (result?.musicXmlUrl) {
              const directMusic = await fetchMusicFromXmlDirect(result.musicXmlUrl);
              if (directMusic) {
                await setMusicWithCoverFallback(directMusic.titulo, directMusic.artista, directMusic.capa, undefined, null);
              }
            }
          }
        } catch { /* silent */ }
      })();
    }

    // ─── 4. Unauthenticated: resilient music polling via edge function + direct XML every 4s ───
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;
    if (!isAuthenticated && effectiveUserId) {
      let musicPollBusy = false;
      fallbackInterval = setInterval(async () => {
        if (musicPollBusy) return;
        musicPollBusy = true;
        try {
          // Always try edge function first (works even when music_xml_url is empty)
          const now = new Date();
          const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
          const day = dayNames[now.getDay()];
          const time = now.toTimeString().slice(0, 5);
          const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-cenario-data?uid=${effectiveUserId}&day=${encodeURIComponent(day)}&time=${time}&ytUrl=${encodeURIComponent(config.chat.youtubeVideoUrl || "")}&date=${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now)}&_cache=0&_t=${Date.now()}`;
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 6000);
          const resp = await fetch(baseUrl, {
            headers: { "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
            signal: controller.signal,
          });
          clearTimeout(timer);
          if (resp.ok) {
            const json = await resp.json();
            if (json?.ok && json.musicData?.titulo && json.musicData.titulo !== "Sem título") {
              setMusicWithCoverFallback(json.musicData.titulo, json.musicData.artista || "", json.musicData.capa || "", undefined, json.musicStartTime || null);
            }
            if (json?.youtubeChatMessages && json.youtubeChatMessages.length > 0) {
              setChatMessages(json.youtubeChatMessages);
            } else if (json?.ok) {
              setChatMessages([]);
            } else {
              // Fallback: try direct XML from browser (for local-network XMLs)
              const xmlUrl = json?.musicXmlUrl || musicXmlUrlRef.current;
              if (xmlUrl) {
                const directMusic = await fetchMusicFromXmlDirect(xmlUrl);
                if (directMusic) {
                  setMusicWithCoverFallback(directMusic.titulo, directMusic.artista, directMusic.capa, undefined, null);
                }
              }
            }
          }
        } catch { /* silent */ }
        musicPollBusy = false;
      }, 6000);
    }
    // ─── 5. Same-tab polling — SCOPED to effectiveUserId ───
    // Same rationale as (1): never read the legacy unscoped key.
    let localPollInterval: ReturnType<typeof setInterval> | null = null;
    if (isAuthenticated && SCOPED_DATA_KEY) {
      localPollInterval = setInterval(() => {
        try {
          const raw = localStorage.getItem(SCOPED_DATA_KEY);
          if (!raw) return;
          const d = JSON.parse(raw) as { titulo?: string; artista?: string; capa?: string; duracao?: number };
          const key = `${d.titulo || ""}|${d.artista || ""}`;
          if (key !== prevMusicRef.current && d.titulo && d.titulo !== "Sem título") {
            const startRaw = SCOPED_START_KEY ? localStorage.getItem(SCOPED_START_KEY) : null;
            const startTime = startRaw ? parseInt(startRaw, 10) : null;
            setMusicWithCoverFallback(d.titulo || "", d.artista || "", d.capa || "", d.duracao, startTime);
          }
        } catch { /* silent */ }
      }, 1500);
    }

    return () => {
      destroyed = true;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(MUSIC_DATA_EVENT, onSameTabMusic);
      if (realtimeCh) supabase.removeChannel(realtimeCh);
      if (fallbackInterval) clearInterval(fallbackInterval);
      if (localPollInterval) clearInterval(localPollInterval);
    };
  }, [effectiveUserId, isAuthenticated, fetchViaEdgeFunction, fetchItunesCover]);

  /* Listen for sync messages from config page via BroadcastChannel */
  useEffect(() => {
    // BroadcastChannel may not be available in vMix's embedded browser
    if (typeof BroadcastChannel === "undefined") return;
    let bc: BroadcastChannel;
    try {
      bc = new BroadcastChannel("cenario-interativo");
    } catch { return; }
    cenarioBcDrawRef.current = bc;
    bc.onmessage = (ev) => {
      if (ev.data?.type === "ping") {
        bc.postMessage({ type: "pong" });
      }
      if (ev.data?.type === "tab-change") {
        const newTab = normalizeSceneTab(ev.data.tab, activeTab);
        const newSubTab = ev.data.subTab;
        const newCurrencySubTab = ev.data.currencySubTab;
        
        if (newTab !== activeTab) {
          setActiveTab(newTab);
          if (newSubTab) setWeatherSubTab(newSubTab);
          if (newCurrencySubTab) setCurrencySubTab(newCurrencySubTab);
        } else {
          if (newSubTab) setWeatherSubTab(newSubTab);
          if (newCurrencySubTab) setCurrencySubTab(newCurrencySubTab);
        }
      }
      if (ev.data?.type === "config-update" && ev.data.config && typeof ev.data.config === "object") {
        setConfig(prev => ({ ...prev, ...(ev.data.config as Partial<CenarioConfig>) }));
      }
      if (ev.data?.type === "full-state") {
        const newTab = normalizeSceneTab(ev.data.tab, activeTab);
        const newSubTab = ev.data.subTab;
        const newCurrencySubTab = ev.data.currencySubTab;

        if (newTab && newTab !== activeTab) {
          setActiveTab(newTab);
          if (newSubTab) setWeatherSubTab(newSubTab);
          if (newCurrencySubTab) setCurrencySubTab(newCurrencySubTab);
        } else {
          if (newSubTab) setWeatherSubTab(newSubTab);
          if (newCurrencySubTab) setCurrencySubTab(newCurrencySubTab);
        }
        if (ev.data.config && typeof ev.data.config === "object") {
          setConfig(prev => ({ ...prev, ...(ev.data.config as Partial<CenarioConfig>) }));
        }
      }
      if (ev.data?.type === "draw") {
        const canvas = canvasRef.current;
        if (canvas) {
          drawOnCanvas(canvas, ev.data.action, ev.data.px, ev.data.py, ev.data.color, ev.data.width);
          if (ev.data.action === "move") setHasDrawing(true);
        }
      }
      if (ev.data?.type === "zoom-change" && typeof ev.data.zoom === "number") {
        setSatelliteZoom(ev.data.zoom);
      }
      if (ev.data?.type === "rotate" && typeof ev.data.angle === "number") {
        setScreenRotation(ev.data.angle);
      }
      if (ev.data?.type === "draw-clear") {
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          setHasDrawing(false);
        }
      }
      if (ev.data?.type === "draw-shape") {
        const canvas = canvasRef.current;
        if (canvas && ev.data) {
          drawShapeOnCanvas(canvas, ev.data.shape, ev.data.startPx, ev.data.startPy, ev.data.endPx, ev.data.endPy, ev.data.color, ev.data.width);
          setHasDrawing(true);
        }
      }
    };
    bc.postMessage({ type: "request-state" });
    return () => { cenarioBcDrawRef.current = null; try { bc.close(); } catch {} };
  }, [drawOnCanvas]);

  const isMapTab = (activeTab === "weather" && weatherSubTab === "satellite" && config.weather.showSatellite) || (activeTab === "traffic" && config.traffic.enabled);

  const isLandscape = screenRotation === 90 || screenRotation === 270;

  /* ── Fixed 1080×1920 virtual canvas scaled to fit viewport ── */
  const CANVAS_W = 1080;
  const CANVAS_H = 1920;
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewScale, setViewScale] = useState(1);

  useEffect(() => {
    const el = containerRef.current?.parentElement;
    if (!el) return;
    const calc = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (isLandscape) {
        setViewScale(Math.min(vw / CANVAS_H, vh / CANVAS_W));
      } else {
        setViewScale(Math.min(vw / CANVAS_W, vh / CANVAS_H));
      }
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, [isLandscape]);

  // Convert old vh-based sizes to px on the 1080×1920 canvas (1vh ≈ 19.2px on 1920h)
  const vhToPx = (v: number) => v * CANVAS_H / 100;
  const vu = "px";

  /* Sidebar button size helper */
  const btnSize = `${vhToPx(3.8)}${vu}`;
  const iconSize = `${vhToPx(1.7)}${vu}`;
  const subBtnSize = `${vhToPx(2.8)}${vu}`;
  const subFontSize = `${vhToPx(1.2)}${vu}`;
  const sidebarPad = `${vhToPx(0.6)}${vu}`;

  return (
    <div className="fixed" style={{ top: 0, left: 0, right: 0, bottom: 0, background: "#000", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
      <div
        ref={containerRef}
        className="relative"
        style={{
          width: CANVAS_W,
          height: CANVAS_H,
          transform: `scale(${viewScale}) rotate(${screenRotation}deg)`,
          transformOrigin: "center center",
          transition: "transform 0.5s ease",
        }}
      >
        <div className="relative cenario-page-wrapper" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", fontSize: `${vhToPx(1.8)}px`, fontFamily: "'Inter', sans-serif" }}>

          {/* Fullscreen background layers behind sidebar */}
          {activeTab === "weather" && weatherSubTab === "satellite" && config.weather.showSatellite && weatherCoords && (
            <div className="absolute inset-0" style={{ zIndex: 5 }}>
              <SatelliteMap lat={weatherCoords.lat} lon={weatherCoords.lon} zoom={satelliteZoom} showControls onZoomChange={(z) => { setSatelliteZoom(z); cenarioBcDrawRef.current?.postMessage({ type: "zoom-change", zoom: z }); rtDrawChannelRef.current?.send({ type: "broadcast", event: "zoom-change", payload: { zoom: z } }); }} />
            </div>
          )}

          {activeTab === "traffic" && config.traffic.enabled && trafficCoords && (
            <div className="absolute inset-0" style={{ zIndex: 1 }}>
              <TrafficMap
                lat={config.traffic.lat ?? trafficCoords.lat}
                lon={config.traffic.lon ?? trafficCoords.lon}
                zoom={config.traffic.zoom}
              />
            </div>
          )}

          {!isMapTab && (() => {
            const altMode = !!config.bgAlternateMode;
            const isHomeOrChat = activeTab === "home" || activeTab === "chat";
            const thumbUrl = (currentProgram?.thumb || currentProgram?.capa) as string | undefined;
            const hasThumb = !!thumbUrl;
            const hasArtist = !!artistBgUrl && !!musicData?.artista && !isBreakTrack;

            // Decide visibility (opacity) per layer
            let thumbVisible = showThumbLayer && hasThumb;
            let artistVisible = showArtistLayer && hasArtist;
            
            // If in alternate mode, override with timed logic
            if (altMode && isHomeOrChat) {
              if (altBgPhase === "thumb") {
                thumbVisible = hasThumb;
                artistVisible = !hasThumb && hasArtist;
              } else {
                artistVisible = hasArtist;
                thumbVisible = !hasArtist && hasThumb;
              }
            }

            return (
              <div className="absolute inset-0" style={{ background: "#000", zIndex: 0 }}>
                {/* Camada 1: Fundo degrade (fica em baixo de tudo) */}
                <div className="absolute inset-0" style={{ 
                  background: config.home.bgGradient ? buildHomeGradient(config.home) : "transparent",
                  zIndex: 1 
                }} />

                {/* Camada 2: Imagem do artista (fica por cima da camada 1) */}
                <div className="absolute inset-0" style={{ zIndex: 2 }}>
                  {isHomeOrChat && hasArtist && prevArtistBgUrl && prevArtistBgUrl !== artistBgUrl && (
                    <img
                      src={prevArtistBgUrl}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ opacity: artistVisible && !artistBgReady ? 1 : 0, filter: "saturate(1.2) brightness(0.7)", transition: "opacity 900ms ease-in-out", willChange: "opacity" }}
                    />
                  )}
                  {isHomeOrChat && artistBgUrl && (
                    <img
                      src={artistBgUrl}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ opacity: artistVisible ? (artistBgReady ? 1 : 0) : 0, filter: "saturate(1.2) brightness(0.7)", transform: "scale(1.16)", transformOrigin: "center center", animation: artistVisible ? "artistBackgroundPan 10s ease-in-out infinite alternate" : "none", transition: "opacity 900ms ease-in-out", willChange: "transform, opacity" }}
                      onLoad={() => setArtistBgReady(true)}
                    />
                  )}
                  {config.home.artistOverlayEnabled && (
                    <div 
                      className="absolute inset-0" 
                      style={{ 
                        opacity: artistVisible ? (config.home.artistOverlayOpacity ?? 60) / 100 : 0,
                        background: config.home.artistOverlayColor || "#000000",
                        transition: "opacity 900ms ease-in-out"
                      }} 
                    />
                  )}
                </div>

                {/* Camada 3: Thumb do programa (fica por cima da camada 1 e 2) */}
                <div className="absolute inset-0" style={{ zIndex: 3 }}>
                  {hasThumb && (activeTab === "home" || activeTab === "weather" || activeTab === "currency" || activeTab === "chat") && (
                    <div className="absolute inset-0" style={{ opacity: thumbVisible ? 1 : 0, transition: "opacity 900ms ease-in-out", willChange: "opacity" }}>
                      <img src={thumbUrl as string} alt="" className="absolute inset-0 w-full h-full object-cover" style={altMode ? { filter: "brightness(0.7)", objectPosition: config.programThumbPosition || "center" } : { filter: "blur(22px) brightness(0.7)", transform: "scale(1.1)", objectPosition: config.programThumbPosition || "center" }} />
                      {config.thumbOverlayEnabled && (
                        <div 
                          className="absolute inset-0" 
                          style={{ 
                            opacity: (config.thumbOverlayOpacity ?? 60) / 100,
                            background: config.thumbOverlayColor || "#000000"
                          }} 
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* Fundo de imagem padrão se nada estiver ativo */}
                <div className="absolute inset-0" style={{ zIndex: 0 }}>
                  {isHomeOrChat && !artistVisible && !thumbVisible && !config.home.bgGradient && config.home.bgImage && <img src={config.home.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover animate-fade-in" style={{ filter: "brightness(0.7)" }} />}
                  {activeTab === "weather" && config.weather.bgImage && <img src={config.weather.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover animate-fade-in" style={{ filter: "brightness(0.7)" }} />}
                  
                  {activeTab === "currency" && config.currency.bgImage && <img src={config.currency.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover animate-fade-in" style={{ filter: "brightness(0.7)" }} />}
                  {activeTab === "chat" && config.chat.bgImage && <img src={config.chat.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover animate-fade-in" style={{ filter: "brightness(0.7)" }} />}
                </div>
              </div>
            );
          })()}

          {/* Sidebar — always on top */}
          {(() => {
            const btnBgOff = config.home.colorButtonBgOff || "rgba(0,0,0,0.8)";
            const btnBgOn = config.home.colorButtonBgOn || "rgba(0,191,240,0.85)";
            const btnIconOff = config.home.colorButtonOff || "rgba(255,255,255,0.7)";
            const btnIconOn = config.home.colorButtonOn || "#FFFFFF";
            return (
              <div className="flex items-center" style={{ position: "absolute", left: 0, top: "28%", width: "8%", zIndex: 10, pointerEvents: "none" }}>
                <div className="flex flex-col items-center" style={{ pointerEvents: "auto", gap: sidebarPad, padding: 0, marginLeft: 0 }}>
                  <button onClick={() => setActiveTab("home")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: btnSize, height: btnSize, background: activeTab === "home" ? btnBgOn : btnBgOff, border: "none", color: activeTab === "home" ? btnIconOn : btnIconOff, textShadow: "0 1px 3px rgba(0,0,0,0.5)", transition: "background 0.3s ease, color 0.3s ease" }}>
                    <Home style={{ width: iconSize, height: iconSize }} />
                  </button>
                  <div className="flex flex-col items-center" style={{ padding: `${vhToPx(0.4)}${vu}`, opacity: config.weather.enabled ? 1 : 0.35, transition: "opacity 0.3s ease" }}>
                    <button onClick={() => { if (activeTab === "weather") { setActiveTab("home"); } else { setActiveTab("weather"); setWeatherSubTab("today"); } }} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: btnSize, height: btnSize, background: activeTab === "weather" ? btnBgOn : btnBgOff, border: "none", color: activeTab === "weather" ? btnIconOn : btnIconOff, textShadow: "0 1px 3px rgba(0,0,0,0.5)", transition: "background 0.3s ease, color 0.3s ease" }}>
                      <CloudSun style={{ width: iconSize, height: iconSize }} />
                    </button>
                    <div style={{ overflow: "hidden", maxHeight: activeTab === "weather" ? `${vhToPx(20)}${vu}` : "0", transition: "max-height 0.35s cubic-bezier(0.4,0,0.2,1)", opacity: activeTab === "weather" ? 1 : 0 }}>
                      <div className="flex flex-col items-center" style={{ gap: `${vhToPx(0.4)}${vu}`, paddingTop: `${vhToPx(0.4)}${vu}` }}>
                        {config.weather.enabled && (
                          <button onClick={() => { setActiveTab("weather"); setWeatherSubTab("today"); }} className="rounded-full flex items-center justify-center font-bold cursor-pointer transition-all" style={{ width: subBtnSize, height: subBtnSize, fontSize: subFontSize, background: activeTab === "weather" && weatherSubTab === "today" ? btnBgOn : btnBgOff, border: "none", color: activeTab === "weather" && weatherSubTab === "today" ? btnIconOn : btnIconOff, textShadow: "0 1px 3px rgba(0,0,0,0.5)", transition: "all 0.25s ease" }}>1</button>
                        )}
                        {config.weather.enabled && config.weather.showSatellite && (
                          <button onClick={() => { setActiveTab("weather"); setWeatherSubTab("satellite"); }} className="rounded-full flex items-center justify-center font-bold cursor-pointer transition-all" style={{ width: subBtnSize, height: subBtnSize, fontSize: subFontSize, background: activeTab === "weather" && weatherSubTab === "satellite" ? btnBgOn : btnBgOff, border: "none", color: activeTab === "weather" && weatherSubTab === "satellite" ? btnIconOn : btnIconOff, textShadow: "0 1px 3px rgba(0,0,0,0.5)", transition: "all 0.25s ease" }}>2</button>
                        )}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setActiveTab("traffic")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: btnSize, height: btnSize, marginTop: `${vhToPx(0.3)}${vu}`, background: activeTab === "traffic" ? btnBgOn : btnBgOff, border: "none", color: activeTab === "traffic" ? btnIconOn : btnIconOff, opacity: config.traffic.enabled ? 1 : 0.35, textShadow: "0 1px 3px rgba(0,0,0,0.5)", transition: "background 0.3s ease, color 0.3s ease" }}>
                    <Car style={{ width: iconSize, height: iconSize }} />
                  </button>
                  <div className="flex flex-col items-center" style={{ padding: `${vhToPx(0.4)}${vu}`, opacity: config.currency.enabled ? 1 : 0.35, transition: "opacity 0.3s ease" }}>
                    <button onClick={() => { if (activeTab === "currency") { setActiveTab("home"); } else { setActiveTab("currency"); setCurrencySubTab("moedas"); } }} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: btnSize, height: btnSize, background: activeTab === "currency" ? btnBgOn : btnBgOff, border: "none", color: activeTab === "currency" ? btnIconOn : btnIconOff, textShadow: "0 1px 3px rgba(0,0,0,0.5)", transition: "background 0.3s ease, color 0.3s ease" }}>
                      <DollarSign style={{ width: iconSize, height: iconSize }} />
                    </button>
                    <div style={{ overflow: "hidden", maxHeight: activeTab === "currency" ? `${vhToPx(10)}${vu}` : "0", transition: "max-height 0.4s cubic-bezier(0.4,0,0.2,1)", opacity: activeTab === "currency" ? 1 : 0 }}>
                      <div className="flex flex-col items-center" style={{ gap: `${vhToPx(0.4)}${vu}`, paddingTop: `${vhToPx(0.4)}${vu}` }}>
                        {config.currency.enabled && (
                          <button onClick={() => { setActiveTab("currency"); setCurrencySubTab("moedas"); }} className="rounded-full flex items-center justify-center font-bold cursor-pointer" style={{ width: subBtnSize, height: subBtnSize, fontSize: subFontSize, background: activeTab === "currency" && currencySubTab === "moedas" ? btnBgOn : btnBgOff, border: "none", color: activeTab === "currency" && currencySubTab === "moedas" ? btnIconOn : btnIconOff, textShadow: "0 1px 3px rgba(0,0,0,0.5)", transition: "all 0.25s ease" }}>1</button>
                        )}
                        {config.currency.enabled && (
                          <button onClick={() => { setActiveTab("currency"); setCurrencySubTab("bolsas"); }} className="rounded-full flex items-center justify-center font-bold cursor-pointer" style={{ width: subBtnSize, height: subBtnSize, fontSize: subFontSize, background: activeTab === "currency" && currencySubTab === "bolsas" ? btnBgOn : btnBgOff, border: "none", color: activeTab === "currency" && currencySubTab === "bolsas" ? btnIconOn : btnIconOff, textShadow: "0 1px 3px rgba(0,0,0,0.5)", transition: "all 0.25s ease" }}>2</button>
                        )}
                      </div>
                    </div>
                  </div>
                  <button onClick={() => setActiveTab("chat")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: btnSize, height: btnSize, background: activeTab === "chat" ? btnBgOn : btnBgOff, border: "none", color: activeTab === "chat" ? btnIconOn : btnIconOff, opacity: config.chat.enabled ? 1 : 0.35, textShadow: "0 1px 3px rgba(0,0,0,0.5)", transition: "background 0.3s ease, color 0.3s ease" }}>
                    <MessageCircle style={{ width: iconSize, height: iconSize }} />
                  </button>
                  <button onClick={() => { setDrawingActive(p => { const next = !p; if (!next) setShowDrawOptions(false); return next; }); }} onContextMenu={(e) => { e.preventDefault(); if (drawingActive) setShowDrawOptions(p => !p); }} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: btnSize, height: btnSize, marginTop: `${vhToPx(0.3)}${vu}`, background: drawingActive ? btnBgOn : btnBgOff, border: "none", color: drawingActive ? btnIconOn : btnIconOff, textShadow: "0 1px 3px rgba(0,0,0,0.5)", transition: "all 0.25s ease" }}>
                    <Pen style={{ width: iconSize, height: iconSize }} />
                  </button>
                  {drawingActive && (
                    <button onClick={() => setShowDrawOptions(p => !p)} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: subBtnSize, height: subBtnSize, background: showDrawOptions ? btnBgOn : btnBgOff, border: "none", transition: "all 0.25s ease" }}>
                      <div style={{ width: `${vhToPx(1.2)}${vu}`, height: `${vhToPx(1.2)}${vu}`, borderRadius: "50%", background: drawColor, boxShadow: "0 1px 3px rgba(0,0,0,0.5)" }} />
                    </button>
                  )}
                  {/* Botão BUG removido */}
                  <div className="flex flex-col gap-1 mt-auto">
                    {/* Botões de camada movidos para a área central da Home conforme solicitado */}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Drawing options panel */}
          {drawingActive && showDrawOptions && (
            <div className="absolute flex flex-col items-center rounded-2xl" style={{ gap: "0.8vh", left: "9.5%", top: "50%", transform: "translateY(-50%)", zIndex: 45, padding: "1.2vh 0.8vh", background: "rgba(20,20,20,0.85)", WebkitBackdropFilter: "blur(12px)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.15)" }}>
              {DRAW_COLORS.map(c => (
                <button key={c} onClick={() => setDrawColor(c)} className="rounded-full cursor-pointer" style={{ width: "2.8vh", height: "2.8vh", background: c, border: drawColor === c ? "2px solid #fff" : "2px solid transparent", boxShadow: drawColor === c ? `0 0 8px ${c}` : "none", transition: "all 0.15s ease" }} />
              ))}
              <div style={{ width: "100%", height: "1px", background: "rgba(255,255,255,0.15)", margin: "0.2vh 0" }} />
              {DRAW_WIDTHS.map(w => (
                <button key={w} onClick={() => setDrawWidth(w)} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: "2.8vh", height: "2.8vh", background: drawWidth === w ? "rgba(255,255,255,0.2)" : "transparent", border: drawWidth === w ? "1px solid rgba(255,255,255,0.4)" : "1px solid transparent", transition: "all 0.15s ease" }}>
                  <div style={{ width: `${Math.max(0.4, w * 0.18)}vh`, height: `${Math.max(0.4, w * 0.18)}vh`, borderRadius: "50%", background: drawColor }} />
                </button>
              ))}
            </div>
          )}

          {/* Content */}
          <div className="flex-1 relative" style={{ zIndex: 1 }}>
            {/* Animated page wrapper */}
            <div
              key={activeTab + (activeTab === "weather" ? `-${weatherSubTab}` : "") + (activeTab === "currency" ? `-${currencySubTab}` : "")}
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, animation: "cenario-page-enter 0.3s cubic-bezier(0.16,1,0.3,1) both" }}
            >

            {/* ═══ HOME ═══ */}
            {activeTab === "home" && (() => {
              let progressPct = 0;
              if (currentProgram) {
                const [sh, sm] = currentProgram.horario_inicio.split(":").map(Number);
                const [eh, em] = currentProgram.horario_fim.split(":").map(Number);
                const startMin = sh * 60 + sm;
                const endMin = eh * 60 + em;
                const nowMin = currentTime.getHours() * 60 + currentTime.getMinutes();
                const total = endMin - startMin;
                if (total > 0) progressPct = Math.min(100, Math.max(0, ((nowMin - startMin) / total) * 100));
              }
              const elPos = (id: string) => config.home.elementPositions?.[id] ?? null;
              /** Build absolute style matching DraggableElement anchor logic */
              const elStyle = (id: string, anchor: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "center", extraCss?: React.CSSProperties): React.CSSProperties | null => {
                const p = elPos(id);
                if (!p) return null;
                const base: React.CSSProperties = { position: "absolute", zIndex: 10, transform: `scale(${p.scale})`, ...extraCss };
                if (anchor === "top-left" || anchor === "center") {
                  base.left = `${p.x}%`; base.top = `${p.y}%`;
                  base.transformOrigin = anchor === "center" ? "center" : "top left";
                  if (anchor === "center") base.transform = `translate(-50%, -50%) scale(${p.scale})`;
                } else if (anchor === "top-right") {
                  base.right = `${100 - p.x}%`; base.top = `${p.y}%`;
                  base.transformOrigin = "top right";
                } else if (anchor === "bottom-left") {
                  base.left = `${p.x}%`; base.bottom = `${100 - p.y}%`;
                  base.transformOrigin = "bottom left";
                } else if (anchor === "bottom-right") {
                  base.right = `${100 - p.x}%`; base.bottom = `${100 - p.y}%`;
                  base.transformOrigin = "bottom right";
                }
                return base;
              };

              return (
                <div className="absolute" style={{ top: 0, left: 0, right: 0, bottom: 0, background: "transparent", color: "#fff", overflow: "hidden" }}>
                  {/* Background already rendered as a full-canvas layer behind sidebar */}

                                      {/* Relógio e data no canto superior esquerdo */}
                   <div style={{ position: "absolute", top: `${vhToPx(3.2)}${vu}`, left: `${vhToPx(3.2)}${vu}`, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "left", color: "#fff", textShadow: "0 2px 10px rgba(0,0,0,0.45)", pointerEvents: "none" }}>
                     <div style={{ fontSize: `${vhToPx(2.7)}${vu}`, fontWeight: 400, fontVariantNumeric: "tabular-nums", lineHeight: 1.05, letterSpacing: "0.01em", color: config.home.colorClock || "#fff", whiteSpace: "nowrap" }}>{currentTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
                     <div style={{ fontSize: `${vhToPx(1.05)}${vu}`, fontWeight: 400, lineHeight: 1.25, marginTop: `${vhToPx(0.45)}${vu}`, color: config.home.colorDate || "#fff", whiteSpace: "nowrap" }}>{currentTime.toLocaleDateString("pt-BR", { weekday: "long" }).replace(/-feira$/, "").replace(/^./, c => c.toUpperCase()) + " - " + currentTime.getDate() + " de " + currentTime.toLocaleDateString("pt-BR", { month: "long" }).replace(/^./, c => c.toUpperCase()) + "/" + currentTime.toLocaleDateString("pt-BR", { year: "2-digit" })}</div>
                   </div>
                   {/* Condição atual no canto superior direito; indicadores alternam a cada 4 segundos */}
                   {liveWeather && (
                     <div style={{ position: "absolute", top: `${vhToPx(2.5)}${vu}`, right: `${vhToPx(3.2)}${vu}`, zIndex: 20, width: `${vhToPx(20)}${vu}`, display: "flex", flexDirection: "column", alignItems: "flex-end", textAlign: "right", color: "#fff", textShadow: "0 2px 10px rgba(0,0,0,0.5)", pointerEvents: "none" }}>
                       <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: `${vhToPx(0.7)}${vu}` }}>
                         <div style={{ fontSize: `${vhToPx(2.3)}${vu}`, fontWeight: 400, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{liveWeather.current.temp}°</div>
                         <WeatherIcon code={liveWeather.current.code} size={vhToPx(4.4)} />
                       </div>
                       <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: `${vhToPx(0.45)}${vu}`, width: "100%", marginTop: `${vhToPx(0.45)}${vu}`, fontSize: `${vhToPx(1.05)}${vu}`, fontWeight: 500, lineHeight: 1.2, whiteSpace: "nowrap" }}>
                         <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: `${vhToPx(0.6)}${vu}` }}><CloudRain size={vhToPx(1.25)} /> <span>{liveWeather.daily?.[0]?.precip ?? 0}%</span></div>
                         <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: `${vhToPx(0.6)}${vu}` }}><Droplets size={vhToPx(1.25)} /> <span>{liveWeather.current.humidity}%</span></div>
                         {(liveWeather.daily?.[0]?.precip ?? 0) > 0 && <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: `${vhToPx(0.6)}${vu}` }}><CloudRain size={vhToPx(1.25)} /> <span>{(liveWeather.daily?.[0]?.rainMm ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm</span></div>}
                       </div>
                     </div>
                   )}
                   
{/* BOTTOM-RIGHT: "A seguir" */}
                  {nextProgram && (
                     <div style={{ position: "absolute", bottom: `${vhToPx(3.5)}${vu}`, right: `${vhToPx(4)}${vu}`, zIndex: 20, textAlign: "right" }}>
                       <div style={{ fontWeight: 600, fontSize: `${vhToPx(1.1)}${vu}`, color: config.home.colorASeguirLabel || accentColor, marginBottom: `${vhToPx(0.5)}${vu}` }}>a seguir</div>
                       <div style={{ fontWeight: 700, fontSize: `${vhToPx(1.65)}${vu}`, lineHeight: 1.1, textShadow: "0 1px 6px rgba(0,0,0,0.4)", maxWidth: `${vhToPx(22)}${vu}`, color: config.home.colorNextProgram || "#fff" }}>{nextProgram.nome.length > 12 ? `${nextProgram.nome.slice(0, 12)}...` : nextProgram.nome}</div>
                       <div style={{ fontWeight: 500, fontSize: `${vhToPx(0.9)}${vu}`, color: "#fff", fontVariantNumeric: "tabular-nums", marginTop: `${vhToPx(0.2)}${vu}` }}>{nextProgram.horario_inicio.slice(0,5)}h</div>
                     </div>
                   )}

                  {/* WRAPPER: BOXES + CONTROLS */}
                  <div style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    transform: "translate(-50%, -50%)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: `${vhToPx(2)}${vu}`,
                    zIndex: 15,
                  }}>
                    {/* ROW: BOX DO LOCUTOR + BOX CAPA */}
                    {(() => {
                      const showProgram = false; // A capa do programa no ar foi removida; exibir somente a capa da música.
                      const showMusic = !!musicData?.capa && !isBreakTrack && config.home.showMusicCover !== false;
                      const currentPhase = (showProgram && showMusic) ? (Math.floor(currentTime.getTime() / 8000) % 2 === 0 ? "program" : "music") : (showProgram ? "program" : "music");
                      
                      return (
                        <div style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-end",
                          zIndex: 15,
                        }}>
                          <div style={{
                            display: "flex",
                            alignItems: "stretch",
                            position: "relative",
                            width: `${vhToPx(18.2)}${vu}`,
                            height: `${vhToPx(18.2)}${vu}`
                          }}>
                            {/* BOX DO LOCUTOR: quadrado 1:1 (always on top) */}
                            <div style={{
                                    width: "100%",
                                    height: "100%",
                                    borderRadius: `${vhToPx(2)}${vu}`,
                                    overflow: "hidden",
                                     background: presenterGradient || `linear-gradient(145deg, ${accentRgba(0.7)}, rgba(0,0,0,0.4))`,
                                     backdropFilter: "blur(20px)",
                                     WebkitBackdropFilter: "blur(20px)",
                                     padding: `${vhToPx(0.9)}${vu}`,
                                     boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                                     border: "1px solid rgba(255,255,255,0.1)",
                                   zIndex: 2,
                                   flexShrink: 0,
                                   display: "none",
                                   opacity: 0,
                                   visibility: "hidden",
                                   transition: "opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                                   transform: `scale(${currentPhase === "program" ? 1 : 0.9}) rotate(${currentPhase === "program" ? 0 : -5}deg)`,
                                   position: "absolute",
                                   inset: 0
                                 }}>
                              {/* Presenter photo anchored at bottom, overflows top */}
                              {(() => {
                                const fotos = currentProgram?.apresentadoresFotos?.length ? currentProgram.apresentadoresFotos : (currentProgram?.apresentadorFoto ? [currentProgram.apresentadorFoto] : []);
                                const activeFoto = fotos[presenterIdx % (fotos.length || 1)];
                                if (!activeFoto) return null;
                                return (
                                  <>
                                    <img
                                      key={activeFoto}
                                      src={activeFoto}
                                      alt=""
                                      style={{
                                        position: "absolute",
                                        bottom: "0",
                                        left: "50%",
                                        transform: "translateX(-50%)",
                                        height: "100%",
                                        width: "auto",
                                        objectFit: "contain",
                                        objectPosition: "bottom center",
                                        filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.4))",
                                        pointerEvents: "none",
                                        zIndex: 1,
                                        animation: "presenter-enter 0.4s cubic-bezier(0.16,1,0.3,1) both",
                                      }}
                                    />
                                  </>
                                );
                              })()}
                              {/* Selo top-right */}
                              {currentProgram?.selo && (
                                <img src={currentProgram.selo} alt="" style={{ position: "absolute", top: `${vhToPx(0.8)}${vu}`, right: `${vhToPx(0.8)}${vu}`, maxHeight: `${vhToPx(5.82)}${vu}`, maxWidth: `${vhToPx(8.74)}${vu}`, objectFit: "contain", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.3))", zIndex: 3 }} />
                              )}
                              {/* Presenter/Music details at bottom */}
                              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: `${vhToPx(1.2)}${vu}`, background: "linear-gradient(transparent, rgba(0,0,0,0.9))", zIndex: 3 }}>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: `${vhToPx(0.2)}${vu}` }}>
                                  <div style={{ display: "flex", alignItems: "center", gap: `${vhToPx(0.4)}${vu}`, width: "100%", justifyContent: "center" }}>
                                    <Mic size={Number(vhToPx(1.2))} style={{ opacity: 0.9, flexShrink: 0, color: "#fff" }} />
                                    <span style={{ fontWeight: 700, fontSize: `${vhToPx(1.1)}${vu}`, color: "#fff", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "normal", textShadow: "0 2px 8px rgba(0,0,0,1)", textAlign: "center", lineHeight: 1.2 }}>{currentProgram?.apresentador || currentProgram?.nome || ""}</span>
                                  </div>
                                  {currentProgram?.apresentadorInstagram && (
                                    <span style={{ fontSize: `${vhToPx(0.9)}${vu}`, color: "#fff", fontWeight: 600, opacity: 0.9, textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
                                      {currentProgram.apresentadorInstagram}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Vinil: aparece após 10s e fica visível por 20s, atrás da capa */}
                            {showMusic && !isNoPlayback && musicData?.capa && (
                              <div style={{ position: "absolute", left: "42%", top: 0, width: "100%", height: "100%", zIndex: 1, pointerEvents: "none", overflow: "visible", opacity: 1 }}>
                                <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "radial-gradient(circle, #343434 0%, #151515 38%, #555 39%, #080808 42%, #292929 44%, #050505 57%, #383838 59%, #090909 63%, #252525 65%, #050505 100%)", border: "2px solid rgba(255,255,255,0.42)", boxShadow: "0 0 0 2px rgba(0,0,0,0.65), 0 5px 16px rgba(0,0,0,0.65)", animation: "vinylSpin 2.4s linear infinite", willChange: "transform" }}>
                                  <div style={{ position: "absolute", inset: "8%", borderRadius: "50%", background: "repeating-conic-gradient(from 0deg, rgba(255,255,255,0.12) 0deg, rgba(255,255,255,0.02) 3deg, transparent 6deg, rgba(0,0,0,0.18) 8deg)", opacity: 0.55 }} />
                                  <div style={{ position: "absolute", inset: "3%", borderRadius: "50%", background: "conic-gradient(from 18deg, transparent 0deg, rgba(255,255,255,0.42) 12deg, rgba(255,255,255,0.08) 26deg, transparent 42deg, transparent 155deg, rgba(255,255,255,0.16) 178deg, transparent 205deg, transparent 360deg)", opacity: 0.8 }} />
                                  <div style={{ position: "absolute", width: "34%", height: "34%", left: "33%", top: "33%", borderRadius: "50%", overflow: "hidden", background: "#333", border: "2px solid rgba(255,255,255,0.16)" }}><img src={musicData.capa} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /></div>
                                  <div style={{ position: "absolute", left: "49%", top: "49%", width: "2%", height: "2%", borderRadius: "50%", background: "#ddd", boxShadow: "0 0 0 1px #111" }} />
                                </div>
                              </div>
                            )}
                            <style>{"@keyframes vinylSpin { to { transform: rotate(360deg); } }"}</style>
{/* ── BOX CAPA: music album art ── */}
                            <div
                              style={{
                                width: "100%",
                                height: "100%",
                                borderRadius: `${vhToPx(2)}${vu}`,
                                overflow: "hidden",
                                flexShrink: 0,
                                zIndex: 2,
                                opacity: showMusic && currentPhase === "music" ? 1 : 0,
                                visibility: showMusic && currentPhase === "music" ? "visible" : "hidden",
                                transition: "opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1), transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
                                transform: `scale(${currentPhase === "music" ? 1 : 0.9}) rotate(${currentPhase === "music" ? 0 : 5}deg)`,
                                position: "absolute",
                                inset: 0,
                                boxShadow: "0 8px 32px rgba(0,0,0,0.4)"
                              }}
                            >
                              {musicData?.capa && (
                                <img
                                  src={musicData.capa}
                                  alt=""
                                  style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                    borderRadius: `${vhToPx(2)}${vu}`,
                                  }}
                                />
                              )}
                            </div>
                          </div>

                          {/* ── Music Details (Text below cover) ── */}
                          {musicData && showMusic && (
                            <div style={{
                              marginTop: `${vhToPx(1)}${vu}`,
                              textAlign: "center",
                              width: "100%",
                              opacity: currentPhase === "music" ? 1 : 0,
                              transform: `translateY(${currentPhase === "music" ? 0 : vhToPx(1) + vu})`,
                              transition: "opacity 0.4s ease, transform 0.4s ease",
                              visibility: currentPhase === "music" ? "visible" : "hidden"
                            }}>
                              <div style={{ fontWeight: 800, fontSize: `${vhToPx(1.7)}${vu}`, color: config.home.colorMusicName || "#fff", textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>
                                {musicData.titulo}
                              </div>
                              <div style={{ fontWeight: 400, fontSize: `${vhToPx(1)}${vu}`, color: config.home.colorMusicTitle || accentColor, marginTop: `${vhToPx(0.2)}${vu}`, textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
                                {musicData.artista}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}


                      {/* ── CONTROLS: Removidos conforme solicitado ── */}


                      {/* ── EXCEPTIONS: hidden ── */}
                      {config.home.exceptionWords && (
                        <div style={{ textAlign: "center", maxWidth: `${vhToPx(40)}${vu}`, marginTop: `${vhToPx(0.5)}${vu}`, display: "none" }}>
                          <span style={{ fontSize: `${vhToPx(0.8)}${vu}`, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", fontWeight: 600 }}>Exceções: </span>
                          <span style={{ fontSize: `${vhToPx(0.8)}${vu}`, color: "rgba(255,255,255,0.3)" }}>{config.home.exceptionWords}</span>
                        </div>
                      )}
                    </div>
                    {/* ── Sponsor logos (centered below locutor + capa boxes) ── */}
                    {sponsorLogos.length > 0 && (
                      <div style={{ position: "absolute", bottom: `${vhToPx(5)}${vu}`, left: "50%", transform: "translateX(-50%)", zIndex: 10 }}>
                        <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center", height: `${vhToPx(23.4)}${vu}` }}>
                          {sponsorLogos.map((l: any, i: number) => l.logo_url && (
                            <img
                              key={l.id}
                              src={resolveSponsorLogoUrl(l.logo_url, l.nome)}
                              alt={l.nome}
                              onError={(e) => {
                                const target = e.currentTarget as HTMLImageElement;
                                target.onerror = null;
                                target.src = "/default-sponsor-logo.png";
                              }}
                              style={{
                                position: "absolute",
                                maxWidth: `${vhToPx(33.15)}${vu}`, maxHeight: `${vhToPx(18.275)}${vu}`,
                                objectFit: "contain",
                                opacity: i === sponsorIdx ? 1 : 0,
                                transform: i === sponsorIdx ? "scale(1)" : "scale(0.9)",
                                transition: "opacity 0.4s ease, transform 0.4s ease",
                                filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))",
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                                                            {/* Foto do locutor ampliada 40%, ancorada na base; identificação sobre a foto */}
                    {currentProgram && (() => {
                      const fotos = currentProgram.apresentadoresFotos?.length ? currentProgram.apresentadoresFotos : (currentProgram.apresentadorFoto ? [currentProgram.apresentadorFoto] : []);
                      const foto = fotos[presenterIdx % (fotos.length || 1)];
                      return (
                        <div style={{ position: "absolute", left: `${vhToPx(2.6)}${vu}`, bottom: 0, width: `${vhToPx(26.6)}${vu}`, height: `${vhToPx(23.8)}${vu}`, zIndex: 14, pointerEvents: "none" }}>
                          {foto && <img src={foto} alt="" style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: "100%", objectFit: "contain", objectPosition: "bottom left", filter: "drop-shadow(0 2px 12px rgba(0,0,0,0.35))", WebkitMaskImage: "none", maskImage: "none" }} />}
                          <div style={{ position: "absolute", left: 0, bottom: `${vhToPx(3.5)}${vu}`, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: `${vhToPx(0.25)}${vu}`, maxWidth: `${vhToPx(34)}${vu}`, textAlign: "left", textShadow: "0 2px 8px rgba(0,0,0,0.8)", zIndex: 16 }}>
                          <span style={{ fontSize: `${vhToPx(1)}${vu}`, fontWeight: 600, color: config.home.colorASeguirLabel || accentColor, letterSpacing: "0.04em" }}>no ar</span>
                          <span style={{ fontSize: `${vhToPx(1.65)}${vu}`, fontWeight: 700, color: "#fff", lineHeight: 1.1 }}>{currentProgram.nome}</span>
                          <span style={{ fontSize: `${vhToPx(1)}${vu}`, fontWeight: 500, color: "#fff", opacity: 0.9, lineHeight: 1.1 }}>{currentProgram.apresentador || ""}</span>
                          </div>
                        </div>
                      );
                    })()}
                    {/* Barra premium: trilho translúcido e preenchimento luminoso */}
                    <div style={{ position: "absolute", bottom: `${vhToPx(2)}${vu}`, left: `${vhToPx(2.6)}${vu}`, right: `${vhToPx(2.6)}${vu}`, height: `${vhToPx(0.32)}${vu}`, background: "rgba(255,255,255,0.42)", zIndex: 15, overflow: "hidden", borderRadius: "999px" }}>
                      <div style={{ width: `${progressPct}%`, height: "100%", background: config.home.colorProgressBar || accentColor, transition: "width 1s linear" }} />
                    </div>

                   <style>{`
                    @keyframes artistBackgroundPan { 0% { transform: scale(1.08) translateX(-1.8%); } 100% { transform: scale(1.08) translateX(1.8%); } }
                    @keyframes shimmerProgress { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } } 
                     @keyframes presenter-enter { 0% { opacity: 0; transform: translateX(-50%) translateY(15%) scale(0.9); } 100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } }
                     @keyframes cenario-page-enter { 0% { opacity: 0; transform: scale(1.02); } 100% { opacity: 1; transform: scale(1); } }
                     
                    @keyframes cenario-box-enter {
                      0% { opacity: 0; transform: translateY(30px) scale(0.95); }
                      100% { opacity: 1; transform: translateY(0) scale(1); }
                    }

                    @keyframes cenario-text-enter {
                      0% { opacity: 0; transform: translateY(20px); }
                      100% { opacity: 1; transform: translateY(0); }
                    }

                    @keyframes cenario-row-enter {
                      0% { opacity: 0; transform: translateX(20px); }
                      100% { opacity: 1; transform: translateX(0); }
                    }

                    .cenario-anim-box { animation: none !important; }
                    .cenario-anim-text { animation: none !important; }
                    
                    .cenario-delay-1 { animation-delay: 0s !important; }
                    .cenario-delay-2 { animation-delay: 0s !important; }
                    .cenario-delay-3 { animation-delay: 0s !important; }
                    .cenario-delay-4 { animation-delay: 0s !important; }
                    .cenario-delay-5 { animation-delay: 0s !important; }
                    .cenario-delay-6 { animation-delay: 0s !important; }

                    .cenario-anim-row-1 { animation: none !important; }
                    .cenario-anim-row-2 { animation: none !important; }
                    .cenario-anim-row-3 { animation: none !important; }
                    
                    .cenario-exit-active { animation: none !important; }
                    
                    @keyframes skeleton-shimmer {
                      0% { opacity: 0.3; }
                      50% { opacity: 0.6; }
                      100% { opacity: 0.3; }
                    }
                    .cenario-skeleton { animation: skeleton-shimmer 1.5s ease-in-out infinite; }
                   `}</style>
                </div>
              );
            })()}

            {/* ═══ WEATHER ═══ */}
            {activeTab === "weather" && (
              <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ color: "#fff" }}>
                {!config.weather.bgImage && <div className="absolute inset-0" style={{ background: "transparent" }} />}
                <div className="absolute inset-0" style={{ background: "transparent" }} />
                <div className="absolute bottom-0 left-0 right-0" style={{ height: "40%", background: "transparent" }} />
                <div className="relative z-10 flex flex-col h-full items-center justify-start overflow-y-auto" style={{ padding: `${vhToPx(2)}${vu}`, paddingLeft: `calc(${vhToPx(2)}${vu} + 50px)` }}>
                  {liveWeather ? (
                    <div className="flex flex-col items-center justify-center h-full w-full" style={{ padding: `${vhToPx(2)}${vu}` }}>
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={weatherSubTab + (currentTime.getSeconds() % 10 > 5 ? "alt" : "main")}
                          initial={{ opacity: 0, scale: 0.9, y: 20 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 1.1, y: -20 }}
                          transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                          className="w-full max-w-[95%] flex flex-col items-center"
                          style={{ gap: `${vhToPx(3)}${vu}` }}
                        >
                          {/* Top Header: City & Title */}
                          <div className="text-center">
                            <motion.div 
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="font-black leading-none" 
                              style={{ 
                                fontSize: `${vhToPx(6)}${vu}`, 
                                letterSpacing: "-0.03em", 
                                textShadow: "0 4px 24px rgba(0,0,0,0.8)",
                                color: "#fff"
                              }}
                            >
                              {(weatherCity || config.city || "Cidade").toUpperCase()}
                            </motion.div>
                            <div className="font-bold uppercase tracking-[0.3em] flex items-center justify-center gap-2" style={{ fontSize: `${vhToPx(1.6)}${vu}`, color: accentColor, marginTop: `${vhToPx(1)}${vu}` }}>
                              <MapPin size={vhToPx(1.6) * 12} /> Previsão do Tempo
                            </div>
                          </div>

                          {/* Main Content */}
                          <div className="w-full max-w-[85%]">
                            <motion.div 
                              key="weather-content"
                              initial={{ opacity: 0, y: 20 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -20 }}
                              className="flex flex-col items-center w-full"
                            >
                          {/* City & Title Section */}
                          <div className="text-center mb-[2vh]">
                            <h2 className="text-[6vh] font-black tracking-tight flex flex-col items-center leading-none" style={{ color: config.home.colorMusicName || "#FFFFFF" }}>
                              {config.weather.city || "goiânia"}
                              <span className="text-[1.8vh] font-bold uppercase tracking-[0.4em] mt-2" style={{ color: config.home.colorDate || config.home.colorMusicTitle || accentColor }}>
                                Previsão do Tempo
                              </span>
                            </h2>
                          </div>

                          {/* Current Weather Card */}
                          <div className="w-full max-w-[92%] bg-white/8 rounded-[2vh] p-[2vh] border border-white/15 backdrop-blur-md mb-[1.5vh] flex flex-col">
                            <div className="flex items-center justify-between mb-8">
                              <div className="relative">
                                <motion.div
                                  animate={{ y: [0, -vhToPx(1), 0] }}
                                  transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                                >
                                  <WeatherIcon code={liveWeather.current.code} size={100} />
                                </motion.div>
                              </div>
                              <div className="text-right">
                                <div className="text-[7vh] font-black leading-none" style={{ color: config.home.colorMusicName || "#FFFFFF" }}>{Math.round(liveWeather.current.temp)}°</div>
                                <div className="text-[1.8vh] font-semibold mt-1" style={{ color: config.home.colorDate || "#FFFFFF" }}>{getWLabel(liveWeather.current.code)}</div>
                              </div>
                            </div>

                            {/* Main Stats Bar */}
                            <div className="bg-black/10 rounded-[1.2vh] py-[1.2vh] px-[1.8vh] flex items-center justify-between border border-white/10">
                              <div className="flex items-center gap-[1.5vh]">
                                <Thermometer className="text-white/40" style={{ width: '2.5vh', height: '2.5vh' }} />
                                <span className="text-[1.8vh] font-semibold" style={{ color: config.home.colorMusicName || "#FFFFFF" }}>{liveWeather.daily[0]?.min}° / {liveWeather.daily[0]?.max}°</span>
                              </div>
                              <div className="flex items-center gap-[1.5vh]">
                                <Droplets className="text-[#00BFF0]" style={{ width: '2.5vh', height: '2.5vh' }} />
                                <span className="text-[2.8vh] font-bold" style={{ color: config.home.colorMusicTitle || accentColor }}>{liveWeather.current.humidity}%</span>
                              </div>
                              <div className="flex items-center gap-[1.5vh]">
                                <CloudRain className="text-white/40" style={{ width: '2.5vh', height: '2.5vh' }} />
                                <span className="text-[2.8vh] font-bold" style={{ color: config.home.colorDate || "#FFFFFF" }}>{liveWeather.daily[0]?.precip ?? 0}%</span>
                              </div>
                            </div>
                          </div>

                          {/* Next Days Section */}
                          <div className="w-full max-w-[92%] space-y-[1vh]">
                            <div className="text-center mb-4">
                              <span className="text-[1.4vh] font-black uppercase tracking-[0.3em]" style={{ color: config.home.colorDate || "#FFFFFF" }}>Próximos Dias</span>
                            </div>
                            
                            {liveWeather.daily.slice(1, 4).map((d, i) => {
                              const dt = new Date(d.date + "T12:00");
                              const wk = dt.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "").toUpperCase();
                              const dayNum = dt.getDate();
                              return (
                                <motion.div 
                                  key={i} 
                                  initial={{ opacity: 0, x: -20 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: i * 0.1 }}
                                  className="bg-white/8 p-[1.5vh] rounded-[1.5vh] border border-white/15 flex items-center justify-between backdrop-blur-sm"
                                >
                                  <span className="text-[2.5vh] font-bold w-[15vh]" style={{ color: config.home.colorMusicName || "#FFFFFF" }}>{wk}, {dayNum}</span>
                                  <div className="flex items-center gap-[2vh]">
                                    <div className="p-[1vh] bg-white/5 rounded-[1.5vh]" style={{ width: '6vh', height: '6vh' }}>
                                      <WeatherIcon code={d.code} size={60} />
                                    </div>
                                    <div className="flex flex-col">
                                      <span className="text-[1.4vh] font-black uppercase flex items-center gap-1" style={{ color: config.home.colorMusicTitle || accentColor }}>
                                        <Droplets style={{ width: '1.2vh', height: '1.2vh' }} /> {d.precip}%
                                      </span>
                                      <span className="text-[1.4vh] font-bold" style={{ color: config.home.colorDate || "#FFFFFF" }}>{d.rainMm || 0}mm</span>
                                    </div>
                                  </div>
                                  <div className="flex items-baseline gap-[1.5vh]">
                                    <span className="text-[3.5vh] font-black" style={{ color: config.home.colorMusicName || "#FFFFFF" }}>{d.max}°</span>
                                    <span className="text-[2vh] font-bold" style={{ color: config.home.colorDate || "#FFFFFF" }}>{d.min}°</span>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        </motion.div>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>
                    ) : (
                    <div className="flex flex-col items-center justify-center h-full w-full" style={{ gap: `${vhToPx(2)}${vu}`, padding: `${vhToPx(2)}${vu}`, marginTop: `-${vhToPx(2)}${vu}` }}>
                      <div className="text-center cenario-anim-text" style={{ marginBottom: `${vhToPx(1.5)}${vu}` }}>
                        <div className="bg-white/10 rounded-lg cenario-skeleton" style={{ width: vhToPx(25), height: vhToPx(5) }} />
                        <div className="bg-white/5 rounded-lg cenario-skeleton mx-auto mt-2" style={{ width: vhToPx(15), height: vhToPx(2) }} />
                      </div>

                      {config.weather.showCurrent && (
                        <div className="rounded-[3vh] w-full max-w-[90%] bg-black/35 backdrop-blur-2xl border border-white/10" style={{ padding: `${vhToPx(3.5)}${vu}` }}>
                          <div className="flex items-center justify-center gap-10 mb-6">
                             <div className="bg-white/10 rounded-full cenario-skeleton" style={{ width: vhToPx(12), height: vhToPx(12) }} />
                             <div className="flex flex-col gap-2">
                               <div className="bg-white/10 rounded-lg cenario-skeleton" style={{ width: vhToPx(15), height: vhToPx(8) }} />
                               <div className="bg-white/5 rounded-lg cenario-skeleton" style={{ width: vhToPx(10), height: vhToPx(2) }} />
                             </div>
                          </div>
                          <div className="flex items-center justify-between rounded-2xl bg-black/15 p-4">
                            <div className="bg-white/10 rounded-lg cenario-skeleton" style={{ width: vhToPx(15), height: vhToPx(3) }} />
                            <div className="bg-white/10 rounded-lg cenario-skeleton" style={{ width: vhToPx(15), height: vhToPx(3) }} />
                          </div>
                        </div>
                      )}

                      {config.weather.showForecast3Days && (
                        <div className="w-full max-w-[90%] flex flex-col gap-4 mt-2">
                           {[1,2,3].map(i => (
                             <div key={i} className="w-full flex items-center bg-black/40 backdrop-blur-xl rounded-[2.5vh] border border-white/15 px-6 gap-8" style={{ height: vhToPx(10) }}>
                               <div className="bg-white/10 rounded-lg cenario-skeleton" style={{ width: vhToPx(12), height: vhToPx(3) }} />
                               <div className="bg-white/10 rounded-full cenario-skeleton" style={{ width: vhToPx(6), height: vhToPx(6) }} />
                               <div className="flex-1 flex flex-col gap-2">
                                 <div className="bg-white/5 rounded-lg cenario-skeleton" style={{ width: vhToPx(8), height: vhToPx(2) }} />
                                 <div className="bg-white/5 rounded-lg cenario-skeleton" style={{ width: vhToPx(8), height: vhToPx(2) }} />
                               </div>
                               <div className="flex flex-col items-end gap-1">
                                 <div className="bg-white/10 rounded-lg cenario-skeleton" style={{ width: vhToPx(8), height: vhToPx(4) }} />
                                 <div className="bg-white/5 rounded-lg cenario-skeleton" style={{ width: vhToPx(5), height: vhToPx(2) }} />
                               </div>
                             </div>
                           ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══ TRAFFIC ═══ */}
            {activeTab === "traffic" && (
              <div className="absolute inset-0 flex flex-col items-center justify-end" style={{ padding: `${vhToPx(3)}${vu}`, pointerEvents: "none" }}>
                {config.traffic.enabled && trafficCoords ? (
                  <div className="flex items-center rounded-2xl" style={{ padding: `${vhToPx(1.2)}${vu} ${vhToPx(3)}${vu}`, background: "rgba(0,0,0,0.3)", border: "none", marginBottom: `${vhToPx(4)}${vu}`, boxShadow: "none" }}>
                    <Car style={{ width: `${vhToPx(2.5)}${vu}`, height: `${vhToPx(2.5)}${vu}`, color: accentColor, marginRight: `${vhToPx(1)}${vu}` }} />
                    <span className="font-black" style={{ fontSize: `${vhToPx(2.4)}${vu}`, color: "#fff", letterSpacing: "-0.01em" }}>{config.traffic.city || config.city || "Trânsito"}</span>
                  </div>
                ) : (
                  <div className="opacity-100" style={{ color: "#fff", fontSize: `${vhToPx(1.8)}${vu}`, textShadow: "0 1px 4px rgba(0,0,0,1)" }}>Trânsito desativado</div>
                )}
              </div>
            )}

            {/* ═══ CURRENCY ═══ */}
            {activeTab === "currency" && (
              <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ color: "#fff" }}>
                {config.currency.bgImage && <div className="absolute inset-0" style={{ background: "transparent" }} />}
                {!config.currency.bgImage && <div className="absolute inset-0" style={{ background: "transparent" }} />}
                <div className="absolute inset-0" style={{ background: "transparent" }} />
                <div className="relative z-10 flex flex-col h-full items-center justify-center" style={{ padding: `${vhToPx(4)}${vu}`, paddingLeft: `calc(${vhToPx(4)}${vu} + 50px)` }}>
                    {config.currency.enabled ? (
                      <CenarioQuotesPanel
                        accentColor={accentColor}
                        currencyOptions={CURRENCY_OPTIONS}
                        currencySubTab={currencySubTab}
                        currencyCodes={config.currency.currencies}
                        liveCurrencies={liveCurrencies}
                        liveStocks={liveStocks}
                        size={vhToPx}
                      />
                    ) : (
                    <div className="flex-1 flex items-center justify-center opacity-100" style={{ fontSize: `${vhToPx(1.9)}${vu}`, textShadow: "0 1px 4px rgba(0,0,0,1)" }}>Cotação desativada</div>
                    )}
                </div>
              </div>
            )}

            {/* ═══ CHAT ═══ */}
            {activeTab === "chat" && (
              <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ color: "#fff" }}>
                {!config.chat.bgImage && !config.home.bgGradient && !config.home.bgImage && <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.4)" }} />}
                <div className="relative z-10 flex flex-col h-full" style={{ padding: `${vhToPx(2)}${vu}` }}>
                  {config.chat.enabled ? (
                    <div className="flex-1 flex flex-col items-center justify-start relative pt-[1vh]">
                      {/* Header for Chat */}
                      <div className="absolute top-0 right-0 flex flex-col items-end">
                        <div className="flex items-center gap-2 mb-1">
                          <MessageCircle size={vhToPx(3.5)} className="drop-shadow-lg" style={{ color: accentColor }} />
                          <div className="font-extrabold leading-tight" style={{ fontSize: `${vhToPx(3.5)}${vu}`, textShadow: "0 2px 10px rgba(0,0,0,1)" }}>mensagens</div>
                        </div>
                        <div className="font-bold uppercase tracking-[0.2em]" style={{ fontSize: `${vhToPx(1.8)}${vu}`, color: accentColor }}>chat ao vivo</div>
                      </div>

                      {/* Last 3 Messages List */}
                      <div className="w-full flex flex-col items-center justify-start gap-[1.5vh]" style={{ padding: `0 ${vhToPx(2)}${vu}`, marginTop: `${vhToPx(9)}${vu}` }}>
                        {chatMessages.slice(-3).map((m, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-4 w-full rounded-[2vh] animate-fade-in"
                            style={{
                              background: 'rgba(0, 0, 0, 0.4)',
                              backdropFilter: 'blur(10px)',
                              WebkitBackdropFilter: 'blur(10px)',
                              padding: `${vhToPx(2.5)}${vu}`,
                              border: '1px solid rgba(255, 255, 255, 0.05)',
                              boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                              animation: `cenario-chat-enter 0.6s cubic-bezier(0.16, 1, 0.3, 1) both ${i * 0.1}s`
                            }}
                          >
                            {/* User Avatar */}
                            <div 
                              className="rounded-full flex items-center justify-center flex-shrink-0 border-2"
                              style={{ 
                                width: vhToPx(6), 
                                height: vhToPx(6), 
                                background: accentRgba(0.2), 
                                borderColor: accentRgba(0.5)
                              }}
                            >
                              <span className="font-bold" style={{ fontSize: vhToPx(2.5), color: '#fff' }}>
                                {m.user.charAt(0).toUpperCase()}
                              </span>
                            </div>

                            <div className="flex flex-col min-w-0">
                              <div 
                                className="font-black uppercase tracking-wider mb-0.5 truncate" 
                                style={{ fontSize: `${vhToPx(1.6)}${vu}`, color: accentColor }}
                              >
                                {m.user}
                              </div>
                              <div 
                                className="font-bold leading-tight" 
                                style={{ fontSize: `${vhToPx(2.2)}${vu}`, color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}
                              >
                                {m.text}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <style>{`
                        @keyframes cenario-chat-enter {
                          0% { opacity: 0; transform: translateY(20px) scale(0.95); }
                          100% { opacity: 1; transform: translateY(0) scale(1); }
                        }
                      `}</style>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center opacity-100" style={{ fontSize: `${vhToPx(1.8)}${vu}`, textShadow: "0 1px 4px rgba(0,0,0,1)" }}>Chat desativado</div>
                  )}
                </div>
              </div>
            )}

            {/* ═══ ENQUETE ═══ */}
            {activeTab === "enquete" && (
              <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ color: "#fff" }}>
                {config.enquete?.bgImage && <img src={config.enquete.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                {!config.enquete?.bgImage && <div className="absolute inset-0" style={{ background: "transparent" }} />}
                <div className="relative z-10 flex flex-col h-full items-center justify-start overflow-y-auto" style={{ padding: `${vhToPx(2)}${vu}` }}>
                  {config.enquete?.enabled ? (
                    <div className="w-full max-w-[85%] flex flex-col items-center">
                      <div className="text-center mb-[2.5vh]">
                        <motion.div 
                          initial={{ opacity: 0, y: -20 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="font-black leading-tight" 
                          style={{ fontSize: `${vhToPx(4.5)}${vu}`, color: config.home.colorMusicName || "#fff", textShadow: "0 2px 12px rgba(0,0,0,0.35)" }}
                        >
                          ENQUETE
                        </motion.div>
                        <div className="font-bold uppercase tracking-[0.4em] mt-[1.5vh]" style={{ fontSize: `${vhToPx(2)}${vu}`, color: accentColor }}>
                          PARTICIPE AGORA
                        </div>
                      </div>

                      {(() => {
                        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
                        const nowTimeStr = currentTime.toTimeString().slice(0, 5);
                        const activePoll = enquetes.find(e => e.data_enquete === today && e.horario_inicio <= nowTimeStr && e.horario_fim >= nowTimeStr);

                        if (activePoll) {
                          return (
                            <motion.div 
                              initial={{ opacity: 0, scale: 0.9 }}
                              animate={{ opacity: 1, scale: 1 }}
                              className="w-full flex flex-col items-center gap-[4vh]"
                            >
                              <div className="w-full p-[4vh] rounded-[3vh] bg-black/40 backdrop-blur-xl border border-white/10 text-center shadow-2xl">
                                <h3 className="font-black leading-tight" style={{ fontSize: `${vhToPx(4.5)}${vu}`, color: '#fff' }}>{activePoll.pergunta}</h3>
                              </div>

                              <div className="grid grid-cols-2 gap-[3vh] w-full">
                                {[activePoll.resposta1, activePoll.resposta2, activePoll.resposta3, activePoll.resposta4].filter(Boolean).map((resp, idx) => (
                                  <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.2 + idx * 0.1 }}
                                    className="p-[3vh] rounded-[2vh] border-2 flex items-center gap-[2vh]"
                                    style={{ 
                                      background: 'rgba(255, 255, 255, 0.05)',
                                      borderColor: 'rgba(255, 255, 255, 0.1)',
                                    }}
                                  >
                                    <div className="w-[6vh] h-[6vh] rounded-full flex items-center justify-center font-black text-[3vh]" style={{ background: accentColor, color: '#fff' }}>
                                      {idx + 1}
                                    </div>
                                    <span className="font-bold text-[2.8vh] text-white">{resp}</span>
                                  </motion.div>
                                ))}
                              </div>
                            </motion.div>
                          );
                        }

                        return (
                          <div className="flex-1 flex flex-col items-center justify-center opacity-40">
                            <Tag size={vhToPx(10)} className="mb-4" />
                            <p className="font-bold uppercase tracking-widest" style={{ fontSize: `${vhToPx(2)}${vu}` }}>Nenhuma enquete ativa no momento</p>
                          </div>
                        );
                      })()}
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-center opacity-40" style={{ fontSize: `${vhToPx(2)}${vu}` }}>Enquete desativada</div>
                  )}
                </div>
              </div>
            )}

            </div>{/* end animated page wrapper */}

          <canvas
            ref={canvasRef}
            className="absolute inset-0"
            style={{
              zIndex: 40,
              cursor: drawingActive ? "crosshair" : "default",
              touchAction: drawingActive ? "none" : "auto",
              pointerEvents: drawingActive ? "auto" : "none",
            }}
            onMouseDown={handleDrawStart}
            onMouseMove={handleDrawMove}
            onMouseUp={handleDrawEnd}
            onMouseLeave={handleDrawEnd}
            onTouchStart={handleDrawStart}
            onTouchMove={handleDrawMove}
            onTouchEnd={handleDrawEnd}
          />

          {/* Clear drawing button */}
          {hasDrawing && (
            <button
              onClick={clearDrawing}
              className="absolute flex items-center justify-center rounded-full"
              style={{ top: "1.5vh", right: "1.5vh", zIndex: 45, width: "4vh", height: "4vh", background: "rgba(239,68,68,0.8)", WebkitBackdropFilter: "blur(8px)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.2)", cursor: "pointer", transition: "all 0.2s ease" }}
            >
              <Eraser style={{ width: "2vh", height: "2vh", color: "white" }} />
            </button>
          )}
  


          {debugMode && (
            <style>{`
              * { border: 1px solid rgba(255, 0, 0, 0.4) !important; background-color: rgba(255, 0, 0, 0.05) !important; }
              img { border: 2px solid #0f0 !important; }
              /* Highlight anything that might be an overlay or filter */
              [style*="background: linear-gradient"], [style*="background-image: linear-gradient"],
              [style*="background: radial-gradient"], [style*="background-image: radial-gradient"],
              [style*="filter"], [style*="backdrop-filter"], [style*="opacity"],
              .absolute.inset-0 { 
                outline: 4px dashed #ff00ff !important;
                outline-offset: -4px;
              }
              [style*="rgba(0,0,0"], [style*="rgba(0, 0, 0"], [style*="#000"] {
                outline: 4px solid #00ffff !important;
              }
            `}</style>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
