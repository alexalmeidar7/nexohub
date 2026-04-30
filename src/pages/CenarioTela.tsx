import { useState, useEffect, useRef, useCallback } from "react";
import { Home, CloudSun, Car, DollarSign, MessageCircle, Thermometer, Droplets, CalendarDays, TrendingUp, TrendingDown, Minus, Loader2, ChevronUp, ChevronDown, Pen, Eraser, Clock, Music, Mic, Play } from "lucide-react";
import { WeatherIcon } from "@/components/WeatherIcons";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { usePageTitle } from "@/hooks/usePageTitle";
import TrafficMap from "@/components/TrafficMap";
import SatelliteMap from "@/components/SatelliteMap";
import CenarioQuotesPanel from "@/components/cenario/CenarioQuotesPanel";

/* ─── types (mirrored from CenarioInterativoPage) ─── */
interface WeatherConfig { enabled: boolean; showCurrent: boolean; showForecast3Days: boolean; showSatellite: boolean; city: string; bgImage: string; }
interface TrafficConfig { enabled: boolean; city: string; points: any[]; bgImage: string; lat: number | null; lon: number | null; zoom: number; }
interface CurrencyConfig { enabled: boolean; currencies: string[]; bgImage: string; }
interface ChatConfig { enabled: boolean; youtubeVideoUrl: string; bgImage: string; }
interface HomeConfig { bgImage: string; bgGradient?: boolean; bgGradientColorA?: string; bgGradientColorB?: string; bgGradientType?: "linear" | "radial"; bgGradientAngle?: number; exceptionWords?: string; elementPositions?: Record<string, { x: number; y: number; scale: number }>; artistOverlayEnabled?: boolean; artistOverlayColor?: string; artistOverlayOpacity?: number; showMusicCover?: boolean; showProgramThumb?: boolean; }
interface CenarioConfig { city: string; useProgramThumbAsBg?: boolean; programThumbPosition?: string; thumbOverlayEnabled?: boolean; thumbOverlayColor?: string; thumbOverlayOpacity?: number; bgAlternateMode?: boolean; home: HomeConfig; weather: WeatherConfig; traffic: TrafficConfig; currency: CurrencyConfig; chat: ChatConfig; }

function buildHomeGradient(h: HomeConfig): string {
  const a = h.bgGradientColorA || "#1a1a2e";
  const b = h.bgGradientColorB || "#16213e";
  const type = h.bgGradientType || "linear";
  const angle = h.bgGradientAngle ?? 135;
  return type === "radial" ? `radial-gradient(circle, ${a}, ${b})` : `linear-gradient(${angle}deg, ${a}, ${b})`;
}

const defaultConfig: CenarioConfig = {
  city: "", home: { bgImage: "" },
  weather: { enabled: true, showCurrent: true, showForecast3Days: true, showSatellite: false, city: "", bgImage: "" },
  traffic: { enabled: false, city: "", points: [], bgImage: "", lat: null, lon: null, zoom: 13 },
  currency: { enabled: true, currencies: ["USD", "EUR"], bgImage: "" },
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
  BR: "🇧🇷", DE: "🇩🇪",
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

type PublicCenarioPayload = {
  ok: boolean;
  cenario_config: any;
  currentProgram: any;
  nextProgram?: any;
  sponsorLogos: any[];
  musicData?: { titulo: string; artista: string; capa: string } | null;
  musicStartTime?: number | null;
  accentColor?: string | null;
  musicXmlUrl?: string | null;
};

const mockMessages = [
  { user: "João Silva", text: "Boa tarde! 🎉" },
  { user: "Maria", text: "Excelente programa hoje!" },
  { user: "Carlos", text: "Manda salve pra galera!" },
];

export default function CenarioTela() {
  const { user } = useAuth();
  usePageTitle("NexoHub - Cenário Interativo");
  const uidFromUrl = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("uid") : null;
  const effectiveUserId = user?.id || uidFromUrl || null;

  const [config, setConfig] = useState<CenarioConfig>(defaultConfig);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [showConnectedMsg, setShowConnectedMsg] = useState(false);
  const presenceShownRef = useRef(false);
  const [backendHealth, setBackendHealth] = useState<"online" | "slow" | "offline">("online");

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
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return "home";
    return new URLSearchParams(window.location.search).get("tab") || "home";
  });
  const [weatherSubTab, setWeatherSubTab] = useState(() => {
    if (typeof window === "undefined") return "today";
    return new URLSearchParams(window.location.search).get("weatherSubTab") || "today";
  });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentProgram, setCurrentProgram] = useState<{ nome: string; id: string; selo?: string | null; horario_inicio: string; horario_fim: string; apresentador?: string; apresentadorFoto?: string; apresentadoresFotos?: string[]; tipo_programa?: string | null; thumb?: string | null; capa?: string | null } | null>(null);
  const [presenterIdx, setPresenterIdx] = useState(0);
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

  const musicXmlUrlRef = useRef<string | null>(null);
  const publicFetchInFlightRef = useRef<Promise<PublicCenarioPayload | null> | null>(null);
  const publicFetchLastResultRef = useRef<PublicCenarioPayload | null>(null);
  const publicFetchLastAtRef = useRef(0);

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
  const isBreakTrack = (() => {
    const titulo = (musicData?.titulo || "").toLowerCase();
    const artista = (musicData?.artista || "").toLowerCase();
    return exceptionWordsList.some(w => titulo === w || artista === w || titulo.includes(w) || artista.includes(w));
  })();
  const isJornalistico = currentProgram?.tipo_programa?.toLowerCase() === "jornalístico" || currentProgram?.tipo_programa?.toLowerCase() === "jornalistico";
  useEffect(() => {
    if (isBreakTrack || isJornalistico) { setArtistBgUrl(null); setPrevArtistBgUrl(null); setArtistBgReady(false); return; }
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
  }, [musicData?.artista, isBreakTrack, isJornalistico]);

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
        if (payload?.tab) setActiveTab(payload.tab);
        if (payload?.subTab) setWeatherSubTab(payload.subTab);
        if (payload?.currencySubTab) setCurrencySubTab(payload.currencySubTab);
      }).on("broadcast", { event: "rotate" }, ({ payload }: any) => {
        if (payload && typeof payload.angle === "number") setScreenRotation(payload.angle);
      }).on("broadcast", { event: "config-update" }, ({ payload }: any) => {
        if (payload?.config && typeof payload.config === "object") {
          setConfig(prev => ({ ...prev, ...(payload.config as Partial<CenarioConfig>) }));
          setLastSyncTime(new Date());
          setBackendHealth("online");
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
        if (_activeTab) setActiveTab(_activeTab);
        if (_weatherSubTab) setWeatherSubTab(_weatherSubTab);
        if (_currencySubTab) setCurrencySubTab(_currencySubTab);
        if (typeof _screenRotation === "number") setScreenRotation(_screenRotation);
      }
    } catch {
      // silent
    }
  }, []);

  /* Helper: fetch all cenario data via public edge function (no auth needed) */
  const publicBackoffRef = useRef({ consecutive: 0, BASE: 3000, MAX: 15000 });
  const fetchViaEdgeFunction = useCallback(async (uid: string) => {
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
        const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-cenario-data?uid=${uid}&day=${encodeURIComponent(day)}&time=${time}`;
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
        if (_activeTab) setActiveTab(_activeTab);
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
        const result = await fetchViaEdgeFunction(effectiveUserId);
        if (result?.cenario_config) applyConfig(result.cenario_config);
        if (result?.accentColor) setAccentColor(result.accentColor);
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
          const result = await fetchViaEdgeFunction(effectiveUserId);
          if (result?.cenario_config) applyConfig(result.cenario_config);
          if (result?.accentColor) setAccentColor(result.accentColor);
          if (result?.currentProgram) {
            setCurrentProgram(result.currentProgram);
            setSponsorLogos(result.sponsorLogos || []);
            setNextProgram(result.nextProgram || null);
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

    // ─── 1. localStorage listener (same-tab, updated by useGlobalMusicSync) ───
    const onStorage = (e: StorageEvent) => {
      if (e.key !== "masterview_music_data" || !e.newValue) return;
      try {
        const d = JSON.parse(e.newValue) as { titulo?: string; artista?: string; capa?: string; duracao?: number };
        if (d.titulo && d.titulo !== "Sem título") {
          const startRaw = localStorage.getItem("masterview_music_start");
          const startTime = startRaw ? parseInt(startRaw, 10) : null;
          setMusicWithCoverFallback(d.titulo || "", d.artista || "", d.capa || "", d.duracao, startTime);
        }
      } catch { /* silent */ }
    };
    window.addEventListener("storage", onStorage);

    // Also read initial value from localStorage
    try {
      const raw = localStorage.getItem("masterview_music_data");
      if (raw) {
        const d = JSON.parse(raw) as { titulo?: string; artista?: string; capa?: string; duracao?: number };
        if (d.titulo && d.titulo !== "Sem título") {
          const startRaw = localStorage.getItem("masterview_music_start");
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
          const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-cenario-data?uid=${effectiveUserId}&day=${encodeURIComponent(day)}&time=${time}&_t=${Date.now()}`;
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
      }, 4000);
    }
    // ─── 5. Same-tab polling for localStorage changes (useGlobalMusicSync writes here) ───
    let localPollInterval: ReturnType<typeof setInterval> | null = null;
    if (isAuthenticated) {
      localPollInterval = setInterval(() => {
        try {
          const raw = localStorage.getItem("masterview_music_data");
          if (!raw) return;
          const d = JSON.parse(raw) as { titulo?: string; artista?: string; capa?: string; duracao?: number };
          const key = `${d.titulo || ""}|${d.artista || ""}`;
          if (key !== prevMusicRef.current && d.titulo && d.titulo !== "Sem título") {
            const startRaw = localStorage.getItem("masterview_music_start");
            const startTime = startRaw ? parseInt(startRaw, 10) : null;
            setMusicWithCoverFallback(d.titulo || "", d.artista || "", d.capa || "", d.duracao, startTime);
          }
        } catch { /* silent */ }
      }, 1500);
    }

    return () => {
      destroyed = true;
      window.removeEventListener("storage", onStorage);
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
        setActiveTab(ev.data.tab);
        if (ev.data.subTab) setWeatherSubTab(ev.data.subTab);
        if (ev.data.currencySubTab) setCurrencySubTab(ev.data.currencySubTab);
      }
      if (ev.data?.type === "config-update" && ev.data.config && typeof ev.data.config === "object") {
        setConfig(prev => ({ ...prev, ...(ev.data.config as Partial<CenarioConfig>) }));
      }
      if (ev.data?.type === "full-state") {
        if (ev.data.tab) setActiveTab(ev.data.tab);
        if (ev.data.subTab) setWeatherSubTab(ev.data.subTab);
        if (ev.data.currencySubTab) setCurrencySubTab(ev.data.currencySubTab);
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
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", fontSize: `${vhToPx(1.8)}px`, fontFamily: "'Inter', sans-serif" }}>

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
            const hasArtist = !!artistBgUrl && !!musicData?.artista && !isBreakTrack && !isJornalistico;

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
                      style={{ opacity: artistVisible && !artistBgReady ? 1 : 0, filter: "saturate(1.2) brightness(0.7)", transition: "opacity 1.2s ease-in-out" }}
                    />
                  )}
                  {isHomeOrChat && artistBgUrl && (
                    <img
                      src={artistBgUrl}
                      alt=""
                      className="absolute inset-0 w-full h-full object-cover"
                      style={{ opacity: artistVisible ? (artistBgReady ? 1 : 0) : 0, filter: "saturate(1.2) brightness(0.7)", transition: "opacity 1.2s ease-in-out" }}
                      onLoad={() => setArtistBgReady(true)}
                    />
                  )}
                  {config.home.artistOverlayEnabled && (
                    <div 
                      className="absolute inset-0 transition-opacity duration-1000" 
                      style={{ 
                        opacity: artistVisible ? (config.home.artistOverlayOpacity ?? 60) / 100 : 0,
                        background: config.home.artistOverlayColor || "#000000"
                      }} 
                    />
                  )}
                </div>

                {/* Camada 3: Thumb do programa (fica por cima da camada 1 e 2) */}
                <div className="absolute inset-0" style={{ zIndex: 3 }}>
                  {hasThumb && (activeTab === "home" || activeTab === "weather" || activeTab === "currency" || activeTab === "chat") && (
                    <div className="absolute inset-0" style={{ opacity: thumbVisible ? 1 : 0, transition: "opacity 1.2s ease-in-out" }}>
                      <img src={thumbUrl as string} alt="" className="absolute inset-0 w-full h-full object-cover" style={altMode ? { filter: "brightness(0.7)", objectPosition: config.programThumbPosition || "center" } : { filter: "blur(22px) brightness(0.7)", transform: "scale(1.1)", objectPosition: config.programThumbPosition || "center" }} />
                      {config.thumbOverlayEnabled && (
                        <div 
                          className="absolute inset-0 transition-opacity duration-1000" 
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
                  {isHomeOrChat && !artistVisible && !thumbVisible && !config.home.bgGradient && config.home.bgImage && <img src={config.home.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: "brightness(0.7)" }} />}
                  {activeTab === "weather" && config.weather.bgImage && <img src={config.weather.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: "brightness(0.7)" }} />}
                  
                  {activeTab === "currency" && config.currency.bgImage && <img src={config.currency.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: "brightness(0.7)" }} />}
                  {activeTab === "chat" && config.chat.bgImage && <img src={config.chat.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: "brightness(0.7)" }} />}
                </div>
              </div>
            );
          })()}

          {/* Sidebar — always on top */}
          <div className="flex-shrink-0 flex items-center relative" style={{ width: "8%", zIndex: 10, pointerEvents: "none" }}>
          <div className="flex flex-col items-center" style={{ pointerEvents: "auto", gap: sidebarPad, padding: `${sidebarPad} 0`, marginLeft: "-1px" }}>
            <button onClick={() => setActiveTab("home")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: btnSize, height: btnSize, background: activeTab === "home" ? accentRgba(0.85) : "rgba(0,0,0,0.8)", border: activeTab === "home" ? `2px solid ${accentColor}` : "2px solid transparent", transition: "background 0.3s ease, border-color 0.3s ease" }}>
              <Home style={{ width: iconSize, height: iconSize }} className="text-white" />
            </button>
            <div className="flex flex-col items-center" style={{ padding: `${vhToPx(0.4)}${vu}`, opacity: config.weather.enabled ? 1 : 0.35, transition: "opacity 0.3s ease" }}>
              <button onClick={() => { if (activeTab === "weather") { setActiveTab("home"); } else { setActiveTab("weather"); setWeatherSubTab("today"); } }} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: btnSize, height: btnSize, background: activeTab === "weather" ? accentRgba(0.85) : "rgba(0,0,0,0.8)", border: activeTab === "weather" ? `2px solid ${accentColor}` : "2px solid transparent", transition: "background 0.3s ease, border-color 0.3s ease" }}>
                <CloudSun style={{ width: iconSize, height: iconSize }} className="text-white" />
              </button>
              <div style={{ overflow: "hidden", maxHeight: activeTab === "weather" ? `${vhToPx(20)}${vu}` : "0", transition: "max-height 0.35s cubic-bezier(0.4,0,0.2,1)", opacity: activeTab === "weather" ? 1 : 0 }}>
                <div className="flex flex-col items-center" style={{ gap: `${vhToPx(0.4)}${vu}`, paddingTop: `${vhToPx(0.4)}${vu}` }}>
                  {config.weather.enabled && config.weather.showCurrent && (
                    <button onClick={() => { setActiveTab("weather"); setWeatherSubTab("today"); }} className="rounded-full flex items-center justify-center text-white font-bold cursor-pointer" style={{ width: subBtnSize, height: subBtnSize, fontSize: subFontSize, background: activeTab === "weather" && weatherSubTab === "today" ? accentRgba(0.2) : "rgba(0,0,0,0.8)", border: activeTab === "weather" && weatherSubTab === "today" ? "1px solid rgba(225,245,50,0.4)" : "1px solid transparent", transition: "all 0.25s ease" }}>1</button>
                  )}
                  {config.weather.enabled && config.weather.showForecast3Days && (
                    <button onClick={() => { setActiveTab("weather"); setWeatherSubTab("forecast"); }} className="rounded-full flex items-center justify-center text-white font-bold cursor-pointer" style={{ width: subBtnSize, height: subBtnSize, fontSize: subFontSize, background: activeTab === "weather" && weatherSubTab === "forecast" ? accentRgba(0.2) : "rgba(0,0,0,0.8)", border: activeTab === "weather" && weatherSubTab === "forecast" ? "1px solid rgba(225,245,50,0.4)" : "1px solid transparent", transition: "all 0.25s ease" }}>2</button>
                  )}
                  {config.weather.enabled && config.weather.showSatellite && (
                    <button onClick={() => { setActiveTab("weather"); setWeatherSubTab("satellite"); }} className="rounded-full flex items-center justify-center text-white font-bold cursor-pointer" style={{ width: subBtnSize, height: subBtnSize, fontSize: subFontSize, background: activeTab === "weather" && weatherSubTab === "satellite" ? accentRgba(0.2) : "rgba(0,0,0,0.8)", border: activeTab === "weather" && weatherSubTab === "satellite" ? "1px solid rgba(225,245,50,0.4)" : "1px solid transparent", transition: "all 0.25s ease" }}>3</button>
                  )}
                </div>
              </div>
            </div>
            <button onClick={() => setActiveTab("traffic")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: btnSize, height: btnSize, marginTop: `${vhToPx(0.3)}${vu}`, background: activeTab === "traffic" ? accentRgba(0.85) : "rgba(0,0,0,0.8)", opacity: config.traffic.enabled ? 1 : 0.35, border: activeTab === "traffic" ? `2px solid ${accentColor}` : "2px solid transparent", transition: "background 0.3s ease, border-color 0.3s ease" }}>
              <Car style={{ width: iconSize, height: iconSize }} className="text-white" />
            </button>
            <div className="flex flex-col items-center" style={{ padding: `${vhToPx(0.4)}${vu}`, opacity: config.currency.enabled ? 1 : 0.35, transition: "opacity 0.3s ease" }}>
              <button onClick={() => { if (activeTab === "currency") { setActiveTab("home"); } else { setActiveTab("currency"); setCurrencySubTab("moedas"); } }} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: btnSize, height: btnSize, background: activeTab === "currency" ? accentRgba(0.85) : "rgba(0,0,0,0.8)", border: activeTab === "currency" ? `2px solid ${accentColor}` : "2px solid transparent", transition: "background 0.3s ease, border-color 0.3s ease" }}>
                <DollarSign style={{ width: iconSize, height: iconSize }} className="text-white" />
              </button>
              <div style={{ overflow: "hidden", maxHeight: activeTab === "currency" ? `${vhToPx(10)}${vu}` : "0", transition: "max-height 0.4s cubic-bezier(0.4,0,0.2,1)", opacity: activeTab === "currency" ? 1 : 0 }}>
                <div className="flex flex-col items-center" style={{ gap: `${vhToPx(0.4)}${vu}`, paddingTop: `${vhToPx(0.4)}${vu}` }}>
                  {config.currency.enabled && (
                    <button onClick={() => { setActiveTab("currency"); setCurrencySubTab("moedas"); }} className="rounded-full flex items-center justify-center text-white font-bold cursor-pointer" style={{ width: subBtnSize, height: subBtnSize, fontSize: subFontSize, background: activeTab === "currency" && currencySubTab === "moedas" ? accentRgba(0.2) : "rgba(0,0,0,0.8)", border: activeTab === "currency" && currencySubTab === "moedas" ? "1px solid rgba(225,245,50,0.4)" : "1px solid transparent", transition: "all 0.25s ease" }}>1</button>
                  )}
                  {config.currency.enabled && (
                    <button onClick={() => { setActiveTab("currency"); setCurrencySubTab("bolsas"); }} className="rounded-full flex items-center justify-center text-white font-bold cursor-pointer" style={{ width: subBtnSize, height: subBtnSize, fontSize: subFontSize, background: activeTab === "currency" && currencySubTab === "bolsas" ? accentRgba(0.2) : "rgba(0,0,0,0.8)", border: activeTab === "currency" && currencySubTab === "bolsas" ? "1px solid rgba(225,245,50,0.4)" : "1px solid transparent", transition: "all 0.25s ease" }}>2</button>
                  )}
                </div>
              </div>
            </div>
            <button onClick={() => setActiveTab("chat")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: btnSize, height: btnSize, background: activeTab === "chat" ? accentRgba(0.85) : "rgba(0,0,0,0.8)", opacity: config.chat.enabled ? 1 : 0.35, border: activeTab === "chat" ? `2px solid ${accentColor}` : "2px solid transparent", transition: "background 0.3s ease, border-color 0.3s ease" }}>
              <MessageCircle style={{ width: iconSize, height: iconSize }} className="text-white" />
            </button>
            <button onClick={() => { setDrawingActive(p => { const next = !p; if (!next) setShowDrawOptions(false); return next; }); }} onContextMenu={(e) => { e.preventDefault(); if (drawingActive) setShowDrawOptions(p => !p); }} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: btnSize, height: btnSize, marginTop: `${vhToPx(0.3)}${vu}`, background: drawingActive ? accentRgba(0.2) : "rgba(0,0,0,0.8)", border: drawingActive ? `2px solid ${accentColor}` : "2px solid transparent", transition: "all 0.25s ease" }}>
              <Pen style={{ width: iconSize, height: iconSize }} className="text-white" />
            </button>
            {drawingActive && (
              <button onClick={() => setShowDrawOptions(p => !p)} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: subBtnSize, height: subBtnSize, background: showDrawOptions ? accentRgba(0.2) : "rgba(0,0,0,0.8)", border: showDrawOptions ? "1px solid rgba(225,245,50,0.4)" : "1px solid transparent", transition: "all 0.25s ease" }}>
                <div style={{ width: `${vhToPx(1.2)}${vu}`, height: `${vhToPx(1.2)}${vu}`, borderRadius: "50%", background: drawColor }} />
              </button>
            )}
          {/* Botão BUG removido */}
            <div className="flex flex-col gap-1 mt-auto">
              {/* Botões de camada movidos para a área central da Home conforme solicitado */}
            </div>
          </div>
          </div>
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
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, animation: "cenario-page-enter 0.45s cubic-bezier(0.16,1,0.3,1) both" }}
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

                   {/* ── Relógio Digital (Top Left) ── */}
                   {(() => {
                     const h = currentTime.getHours().toString().padStart(2, "0");
                     const m = currentTime.getMinutes().toString().padStart(2, "0");
                     const s = currentTime.getSeconds().toString().padStart(2, "0");
                     return (
                        <div style={{
                          position: "absolute",
                          top: `${vhToPx(3.5)}${vu}`,
                          left: `${vhToPx(4)}${vu}`,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                          color: "#fff",
                          zIndex: 20,
                          textShadow: "0 2px 10px rgba(0,0,0,0.5)",
                          width: 'max-content'
                        }}>
                         <div style={{ fontSize: `${vhToPx(3.5)}${vu}`, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em" }}>
                           {h}:{m}<span style={{ opacity: 0.6, fontSize: "0.7em", marginLeft: "2px" }}>{s}</span>
                         </div>
                         <div style={{ fontSize: `${vhToPx(1.2)}${vu}`, fontWeight: 600, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: "2px" }}>
                           {currentTime.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", year: "2-digit" })}
                         </div>
                       </div>
                      );
                    })()}

                  {/* Status Sync (Bottom Left) */}
                  <div style={{ position: "absolute", bottom: `${vhToPx(3.5)}${vu}`, left: `${vhToPx(4)}${vu}`, zIndex: 20 }}>
                     <div style={{ display: "flex", alignItems: "center", gap: `${vhToPx(0.4)}${vu}`, opacity: 0.7 }}>
                       <div style={{ width: `${vhToPx(0.6)}${vu}`, height: `${vhToPx(0.6)}${vu}`, borderRadius: "50%", background: accentColor, boxShadow: `0 0 6px ${accentColor}` }} />
                       <span style={{ fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", fontSize: `${vhToPx(0.9)}${vu}`, color: "#fff" }}>SYNC</span>
                     </div>
                   </div>

                  {/* BOTTOM-RIGHT: "A seguir" */}
                  {nextProgram && (
                     <div style={{ position: "absolute", bottom: `${vhToPx(3.5)}${vu}`, right: `${vhToPx(4)}${vu}`, zIndex: 20, textAlign: "right" }}>
                       <div style={{ fontWeight: 600, fontSize: `${vhToPx(1.1)}${vu}`, color: accentColor, marginBottom: `${vhToPx(0.5)}${vu}` }}>a seguir</div>
                       <div style={{ fontWeight: 700, fontSize: `${vhToPx(2.2)}${vu}`, lineHeight: 1.2, textShadow: "0 1px 6px rgba(0,0,0,0.4)", maxWidth: `${vhToPx(22)}${vu}`, color: "#fff" }}>{nextProgram.nome}</div>
                       <div style={{ fontWeight: 500, fontSize: `${vhToPx(0.9)}${vu}`, color: "#fff", fontVariantNumeric: "tabular-nums", marginTop: `${vhToPx(0.2)}${vu}` }}>{nextProgram.horario_inicio.slice(0,5)}h</div>
                     </div>
                   )}

                  {/* WRAPPER: BOXES + CONTROLS */}
                  <div style={{
                    position: "absolute",
                    top: `calc(${vhToPx(3.5)}${vu} - 2px)`,
                    right: `${vhToPx(4)}${vu}`,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-end",
                    gap: `${vhToPx(2)}${vu}`,
                    zIndex: 15,
                  }}>
                    {/* ROW: BOX DO LOCUTOR + BOX CAPA */}
                    {(() => {
                      const showProgram = config.home.showProgramThumb !== false;
                      const showMusic = !!musicData?.capa && !isBreakTrack && config.home.showMusicCover !== false;
                      const currentPhase = (showProgram && showMusic) ? (Math.floor(Date.now() / 8000) % 2 === 0 ? "program" : "music") : (showProgram ? "program" : "music");
                      
                      return (
                        <div style={{
                          display: "flex",
                          alignItems: "stretch",
                          gap: `${vhToPx(1)}${vu}`,
                          position: "relative"
                        }}>
                          {/* BOX DO LOCUTOR: quadrado 1:1 (always on top) */}
                          <div style={{
                                  width: `${vhToPx(20)}${vu}`,
                                  height: `${vhToPx(20)}${vu}`,
                                  borderRadius: `${vhToPx(2)}${vu}`,
                                   background: `linear-gradient(145deg, ${accentRgba(0.7)}, rgba(0,0,0,0.4))`,
                                   backdropFilter: "blur(20px)",
                                   WebkitBackdropFilter: "blur(20px)",
                                   padding: `${vhToPx(0.9)}${vu}`,
                                   boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                                   border: "1px solid rgba(255,255,255,0.1)",
                                 zIndex: 2,
                                 flexShrink: 0,
                                 opacity: showProgram && currentPhase === "program" ? 1 : 0,
                                 visibility: showProgram && currentPhase === "program" ? "visible" : "hidden",
                                 transition: "opacity 0.8s ease, visibility 0.8s",
                                 position: showProgram && currentPhase === "program" ? "relative" : "absolute"
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
                                      animation: "presenter-enter 0.8s cubic-bezier(0.16,1,0.3,1) both",
                                    }}
                                  />
                                </>
                              );
                            })()}
                            {/* Selo top-right */}
                            {currentProgram?.selo && (
                              <img src={currentProgram.selo} alt="" style={{ position: "absolute", top: `${vhToPx(0.8)}${vu}`, right: `${vhToPx(0.8)}${vu}`, maxHeight: `${vhToPx(5.82)}${vu}`, maxWidth: `${vhToPx(8.74)}${vu}`, objectFit: "contain", filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.3))", zIndex: 3 }} />
                            )}
                            {/* Presenter name at bottom */}
                            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: `${vhToPx(1.5)}${vu}`, background: "linear-gradient(transparent, rgba(0,0,0,0.8))", zIndex: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: `${vhToPx(0.4)}${vu}` }}>
                                <Mic size={Number(vhToPx(1.2))} style={{ opacity: 0.9, flexShrink: 0, color: "#fff" }} />
                                <span style={{ fontWeight: 700, fontSize: `${vhToPx(1.3)}${vu}`, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textShadow: "0 2px 8px rgba(0,0,0,1)" }}>{currentProgram?.apresentador || currentProgram?.nome || ""}</span>
                              </div>
                            </div>
                          </div>

                          {/* ── BOX CAPA: music album art ── */}
                          <div
                            style={{
                              width: `${vhToPx(20)}${vu}`,
                              height: `${vhToPx(20)}${vu}`,
                              borderRadius: `${vhToPx(2)}${vu}`,
                              overflow: "hidden",
                              flexShrink: 0,
                              zIndex: 1,
                              opacity: showMusic && currentPhase === "music" ? 1 : 0,
                              visibility: showMusic && currentPhase === "music" ? "visible" : "hidden",
                              transition: "opacity 0.8s ease, visibility 0.8s",
                              position: showMusic && currentPhase === "music" ? "relative" : "absolute",
                              right: 0
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
                      <div style={{ position: "absolute", bottom: `${vhToPx(9)}${vu}`, left: "50%", transform: "translateX(-50%)", zIndex: 10 }}>
                        <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center", height: `${vhToPx(23.4)}${vu}` }}>
                          {sponsorLogos.map((l: any, i: number) => l.logo_url && (
                            <img
                              key={l.id}
                              src={l.logo_url}
                              alt={l.nome}
                              style={{
                                position: "absolute",
                                maxWidth: `${vhToPx(39)}${vu}`, maxHeight: `${vhToPx(21.5)}${vu}`,
                                objectFit: "contain",
                                opacity: i === sponsorIdx ? 1 : 0,
                                transform: i === sponsorIdx ? "scale(1)" : "scale(0.9)",
                                transition: "opacity 0.8s ease, transform 0.8s ease",
                                filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))",
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Progress bar — premium animated */}
                    <div style={{ position: "absolute", bottom: `${vhToPx(2)}${vu}`, left: `${vhToPx(2.6)}${vu}`, right: `${vhToPx(2.6)}${vu}`, height: `${vhToPx(0.5)}${vu}`, background: "rgba(255,255,255,0.15)", zIndex: 15, overflow: "hidden", borderRadius: `${vhToPx(0.3)}${vu}` }}>
                      <div style={{ width: `${progressPct}%`, height: "100%", borderRadius: `${vhToPx(0.3)}${vu}`, background: `linear-gradient(90deg, ${accentColor}, rgba(255,255,255,0.5), ${accentColor})`, backgroundSize: "200% 100%", animation: "shimmerProgress 2s linear infinite", transition: "width 1s linear", boxShadow: `0 0 6px ${accentColor}, 0 0 14px rgba(255,255,255,0.15)` }} />
                    </div>

                   <style>{`@keyframes shimmerProgress { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } } @keyframes presenter-enter { 0% { opacity: 0; transform: translateX(-50%) translateY(15%) scale(0.9); } 100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); } }`}</style>
                </div>
              );
            })()}

            {/* ═══ WEATHER ═══ */}
            {activeTab === "weather" && (
              <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ color: "#fff" }}>
                {!config.weather.bgImage && <div className="absolute inset-0" style={{ background: "transparent" }} />}
                <div className="absolute inset-0" style={{ background: "transparent" }} />
                <div className="absolute bottom-0 left-0 right-0" style={{ height: "40%", background: "transparent" }} />
                <div className="relative z-10 flex flex-col h-full items-center justify-center" style={{ padding: `${vhToPx(4)}${vu}`, paddingLeft: `calc(${vhToPx(4)}${vu} + 50px)` }}>
                  {liveWeather ? (<>
                    {weatherSubTab === "today" && (
                      <div style={{ width: "88%", maxWidth: `${vhToPx(46)}${vu}` }}>
                        {/* City name + label */}
                        <div className="flex items-start justify-between" style={{ marginBottom: `${vhToPx(3)}${vu}` }}>
                          <div>
                            <div className="font-black leading-none" style={{ fontSize: `${vhToPx(4.5)}${vu}`, letterSpacing: "-0.03em", textShadow: "0 3px 20px rgba(0,0,0,1)" }}>{weatherCity || config.city || "Cidade"}</div>
                            <div className="font-bold uppercase tracking-widest" style={{ fontSize: `${vhToPx(1.6)}${vu}`, color: accentColor, marginTop: `${vhToPx(0.6)}${vu}`, letterSpacing: "0.2em" }}>agora</div>
                          </div>
                        </div>
                        {/* Main weather card */}
                        <div className="rounded-[2.5vh]" style={{ padding: `${vhToPx(3.5)}${vu}`, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.1)", boxShadow: "0 20px 50px rgba(0,0,0,0.4)" }}>
                          <div className="flex items-center" style={{ gap: `${vhToPx(3)}${vu}`, marginBottom: `${vhToPx(2.5)}${vu}` }}>
                            <div style={{ width: `${vhToPx(14)}${vu}`, height: `${vhToPx(14)}${vu}`, filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.3))" }}>
                              <WeatherIcon code={liveWeather.current.code} size={200} forceDay />
                            </div>
                            <div className="flex flex-col">
                              <div className="font-black" style={{ fontSize: `${vhToPx(8)}${vu}`, lineHeight: 0.9, textShadow: "0 3px 16px rgba(0,0,0,1)" }}>{liveWeather.current.temp}°</div>
                              <div className="font-medium" style={{ fontSize: `${vhToPx(2)}${vu}`, opacity: 0.85, marginTop: `${vhToPx(0.5)}${vu}` }}>{getWLabel(liveWeather.current.code)}</div>
                            </div>
                          </div>
                          {/* Stats row */}
                          <div className="flex items-center justify-between rounded-2xl" style={{ padding: `${vhToPx(1.8)}${vu} ${vhToPx(2.5)}${vu}`, background: "rgba(0,0,0,0.1)", border: "none" }}>
                            <div className="flex items-center" style={{ gap: `${vhToPx(1)}${vu}` }}>
                              <Thermometer style={{ width: `${vhToPx(2.2)}${vu}`, height: `${vhToPx(2.2)}${vu}`, opacity: 0.7 }} />
                              <span className="font-bold tabular-nums" style={{ fontSize: `${vhToPx(2.2)}${vu}` }}>{liveWeather.daily[0]?.min ?? "--"}° / {liveWeather.daily[0]?.max ?? "--"}°</span>
                            </div>
                            <div className="flex items-center" style={{ gap: `${vhToPx(2)}${vu}`, fontSize: `${vhToPx(1.8)}${vu}` }}>
                              <span className="flex items-center" style={{ gap: `${vhToPx(0.5)}${vu}` }}><Droplets style={{ width: `${vhToPx(1.8)}${vu}`, height: `${vhToPx(1.8)}${vu}`, opacity: 0.7 }} /> {liveWeather.current.humidity}%</span>
                              <span className="flex items-center" style={{ gap: `${vhToPx(0.5)}${vu}` }}>🌧 {liveWeather.daily[0]?.precip ?? 0}%</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {weatherSubTab === "forecast" && (
                      <div className="flex flex-col items-center justify-center" style={{ width: "92%", maxWidth: `${vhToPx(55)}${vu}`, height: "100%" }}>
                        {/* Header */}
                        <div className="text-center" style={{ marginBottom: `${vhToPx(4)}${vu}` }}>
                          <div className="font-extrabold leading-none" style={{ fontSize: `${vhToPx(5)}${vu}`, letterSpacing: "-0.03em", textShadow: "0 3px 20px rgba(0,0,0,1)" }}>{weatherCity || config.city || "Cidade"}</div>
                          <div className="font-bold uppercase tracking-widest" style={{ fontSize: `${vhToPx(1.8)}${vu}`, color: accentColor, marginTop: `${vhToPx(0.8)}${vu}`, letterSpacing: "0.2em" }}>próximos dias</div>
                        </div>
                        {/* Forecast cards - vertical stack for 9:16 */}
                        <div className="w-full flex flex-col" style={{ gap: `${vhToPx(1.5)}${vu}` }}>
                          {liveWeather.daily.slice(1, 5).map((d, i) => (
                            <div key={i} className={`w-full flex items-center cenario-anim-row-${i + 1}`} style={{
                              padding: `${vhToPx(2)}${vu} ${vhToPx(2.5)}${vu}`,
                              background: "rgba(0,0,0,0.3)",
                              backdropFilter: "blur(10px)",
                              WebkitBackdropFilter: "blur(10px)",
                              borderRadius: `${vhToPx(2.5)}${vu}`,
                              border: "1px solid rgba(255,255,255,0.05)",
                              boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
                              gap: `${vhToPx(2)}${vu}`,
                            }}>
                              {/* Day name */}
                              <div style={{ minWidth: `${vhToPx(11)}${vu}` }}>
                                <span className="font-black capitalize" style={{ fontSize: `${vhToPx(2)}${vu}`, lineHeight: 1.1 }}>{new Date(d.date + "T12:00").toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" })}</span>
                              </div>
                              {/* Icon */}
                              <div style={{ width: `${vhToPx(6)}${vu}`, height: `${vhToPx(6)}${vu}`, flexShrink: 0 }}>
                                <WeatherIcon code={d.code} size={96} forceDay />
                              </div>
                              {/* Details */}
                              <div className="flex flex-col flex-1" style={{ minWidth: 0, gap: `${vhToPx(0.4)}${vu}` }}>
                                <div className="flex items-center" style={{ gap: `${vhToPx(1)}${vu}`, fontSize: `${vhToPx(1.3)}${vu}`, opacity: 0.7, lineHeight: 1 }}>
                                  <span style={{ color: "#7dd3fc" }}>💧{d.precip}%</span>
                                  <span>{d.rainMm}mm</span>
                                </div>
                                <div style={{ fontSize: `${vhToPx(1.3)}${vu}`, opacity: 0.6, lineHeight: 1 }}>🌬 {d.windMax}km/h</div>
                              </div>
                              {/* Temps */}
                              <div className="flex items-baseline" style={{ flexShrink: 0, gap: `${vhToPx(0.6)}${vu}` }}>
                                <span className="font-black tabular-nums" style={{ fontSize: `${vhToPx(2.8)}${vu}`, lineHeight: 1, textShadow: "0 2px 8px rgba(0,0,0,1)" }}>{d.max}°</span>
                                <span className="font-medium tabular-nums" style={{ fontSize: `${vhToPx(1.7)}${vu}`, opacity: 0.55, lineHeight: 1 }}>{d.min}°</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {weatherSubTab === "satellite" && null}
                  </>) : (
                    <div className="flex-1 flex items-center justify-center opacity-100" style={{ fontSize: `${vhToPx(1.8)}${vu}`, textShadow: "0 1px 4px rgba(0,0,0,1)" }}>
                      <CloudSun size={24} className="mr-1" /> {weatherCity ? "Carregando..." : "Configure uma cidade"}
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
                <div className="relative z-10 flex flex-col h-full" style={{ padding: `${vhToPx(3)}${vu}` }}>
                  {config.chat.enabled ? (<>
                    <div className="flex justify-end mb-1"><MessageCircle size={48} className="drop-shadow-lg" style={{ color: accentColor }} /></div>
                    <div style={{ marginBottom: `${vhToPx(2)}${vu}` }}>
                      <div className="font-extrabold leading-tight" style={{ fontSize: `${vhToPx(4)}${vu}`, textShadow: "0 2px 10px rgba(0,0,0,1)" }}>mensagens</div>
                      <div className="font-bold" style={{ fontSize: `${vhToPx(2.5)}${vu}`, color: accentColor }}>chat</div>
                    </div>
                    <div className="flex-1 rounded-xl overflow-hidden" style={{ background: "transparent", border: "none" }}>
                      {(() => {
                        const ytUrl = config.chat.youtubeVideoUrl || "";
                        let videoId = "";
                        const m1 = ytUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
                        const m2 = ytUrl.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
                        const m3 = ytUrl.match(/\/live\/([a-zA-Z0-9_-]{11})/);
                        videoId = m1?.[1] || m2?.[1] || m3?.[1] || "";
                        if (videoId) {
                          return (
                            <iframe
                              src={`https://www.youtube.com/live_chat?v=${videoId}&embed_domain=${window.location.hostname}&dark_theme=1`}
                              className="w-full h-full border-0"
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                            />
                          );
                        }
                        return (
                          <div className="flex-1 flex items-center justify-center h-full" style={{ fontSize: `${vhToPx(1.8)}${vu}`, opacity: 1, textShadow: "0 1px 4px rgba(0,0,0,1)" }}>
                            Insira a URL da live para carregar o chat
                          </div>
                        );
                      })()}
                    </div>
                  </>) : (
                    <div className="flex-1 flex items-center justify-center opacity-100" style={{ fontSize: `${vhToPx(1.8)}${vu}`, textShadow: "0 1px 4px rgba(0,0,0,1)" }}>Chat desativado</div>
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
  

          {/* "Telas Conectadas" notification */}
          {showConnectedMsg && (
            <div
              className="absolute left-1/2 flex items-center gap-2 px-4 py-2 rounded-full"
              style={{
                top: "3vh",
                transform: "translateX(-50%)",
                zIndex: 60,
                background: "rgba(74,222,128,0.2)",
                WebkitBackdropFilter: "blur(16px)", backdropFilter: "blur(16px)",
                border: "1px solid rgba(74,222,128,0.4)",
                animation: "cenario-page-enter 0.5s cubic-bezier(0.16,1,0.3,1) both",
              }}
            >
              <div className="rounded-full" style={{ width: "1vh", height: "1vh", background: "#4ade80", boxShadow: "0 0 8px #4ade80" }} />
              <span className="text-white font-semibold" style={{ fontSize: "1.4vh" }}>Telas conectadas</span>
            </div>
          )}

          {/* Backend health indicator (public/unauthenticated only) */}
          {!isAuthenticated && backendHealth !== "online" && (
            <div
              className="absolute flex items-center gap-1.5 rounded-full"
              style={{
                bottom: "2vh",
                left: "2vh",
                zIndex: 60,
                padding: "0.4vh 1.2vh",
                background: backendHealth === "offline" ? "rgba(239,68,68,0.25)" : "rgba(250,204,21,0.2)",
                WebkitBackdropFilter: "blur(12px)",
                backdropFilter: "blur(12px)",
                border: `1px solid ${backendHealth === "offline" ? "rgba(239,68,68,0.5)" : "rgba(250,204,21,0.4)"}`,
                animation: "cenario-page-enter 0.5s cubic-bezier(0.16,1,0.3,1) both",
              }}
            >
              <div
                className="rounded-full"
                style={{
                  width: "0.8vh",
                  height: "0.8vh",
                  background: backendHealth === "offline" ? "#ef4444" : "#facc15",
                  boxShadow: `0 0 6px ${backendHealth === "offline" ? "#ef4444" : "#facc15"}`,
                  animation: "dualSourceBlink 2s ease-in-out infinite",
                }}
              />
              <span className="text-white/80 font-medium" style={{ fontSize: "1.1vh" }}>
                {backendHealth === "offline" ? "Conexão indisponível — tentando reconectar…" : "Conexão lenta — aguarde…"}
              </span>
            </div>
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
