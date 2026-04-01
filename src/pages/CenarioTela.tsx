import { useState, useEffect, useRef, useCallback } from "react";
import { Home, CloudSun, Car, DollarSign, MessageCircle, Thermometer, Droplets, CalendarDays, TrendingUp, TrendingDown, Minus, Loader2, ChevronUp, ChevronDown, Pen, Eraser, Clock, Music, Mic, Play } from "lucide-react";
import { WeatherIcon } from "@/components/WeatherIcons";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { usePageTitle } from "@/hooks/usePageTitle";
import TrafficMap from "@/components/TrafficMap";
import SatelliteMap from "@/components/SatelliteMap";

/* ─── types (mirrored from CenarioInterativoPage) ─── */
interface WeatherConfig { enabled: boolean; showCurrent: boolean; showForecast3Days: boolean; showSatellite: boolean; city: string; bgImage: string; }
interface TrafficConfig { enabled: boolean; city: string; points: any[]; bgImage: string; lat: number | null; lon: number | null; zoom: number; }
interface CurrencyConfig { enabled: boolean; currencies: string[]; bgImage: string; }
interface ChatConfig { enabled: boolean; youtubeVideoUrl: string; bgImage: string; }
interface HomeConfig { bgImage: string; bgGradient?: boolean; bgGradientColorA?: string; bgGradientColorB?: string; bgGradientType?: "linear" | "radial"; bgGradientAngle?: number; }
interface CenarioConfig { city: string; home: HomeConfig; weather: WeatherConfig; traffic: TrafficConfig; currency: CurrencyConfig; chat: ChatConfig; }

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
        value: parseFloat(item.bid).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }),
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

const weatherIcons: Record<number, string> = { 0:"☀️",1:"🌤️",2:"⛅",3:"☁️",45:"🌫️",48:"🌫️",51:"🌦️",53:"🌦️",55:"🌧️",61:"🌧️",63:"🌧️",65:"🌧️",71:"🌨️",73:"🌨️",75:"🌨️",80:"🌧️",81:"🌧️",82:"🌧️",95:"⛈️",96:"⛈️",99:"⛈️" };
const weatherLabels: Record<number, string> = { 0:"Céu limpo",1:"Parcialmente limpo",2:"Parcialmente nublado",3:"Nublado",45:"Neblina",48:"Neblina",51:"Garoa leve",53:"Garoa",55:"Garoa forte",61:"Chuva leve",63:"Chuva moderada",65:"Chuva forte",71:"Neve leve",73:"Neve",75:"Neve forte",80:"Pancadas leves",81:"Pancadas",82:"Pancadas fortes",95:"Tempestade",96:"Tempestade com granizo",99:"Tempestade severa" };
function getWIcon(code: number) { return weatherIcons[code] ?? weatherIcons[Object.keys(weatherIcons).map(Number).reduce((a, b) => Math.abs(b - code) < Math.abs(a - code) ? b : a)] ?? "🌡️"; }
function getWLabel(code: number) { return weatherLabels[code] ?? weatherLabels[Object.keys(weatherLabels).map(Number).reduce((a, b) => Math.abs(b - code) < Math.abs(a - code) ? b : a)] ?? ""; }

interface LiveWeather {
  current: { temp: number; humidity: number; code: number };
  daily: { date: string; min: number; max: number; code: number; humidity: number; precip: number }[];
}

type PublicCenarioPayload = {
  ok: boolean;
  cenario_config: any;
  currentProgram: any;
  nextProgram?: any;
  sponsorLogos: any[];
  musicData?: { titulo: string; artista: string; capa: string } | null;
  musicStartTime?: number | null;
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
  const [currentProgram, setCurrentProgram] = useState<{ nome: string; id: string; selo?: string | null; horario_inicio: string; horario_fim: string; apresentador?: string; tipo_programa?: string | null } | null>(null);
  const [sponsorLogos, setSponsorLogos] = useState<{ id: string; nome: string; logo_url: string }[]>([]);
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

  const publicFetchInFlightRef = useRef<Promise<PublicCenarioPayload | null> | null>(null);
  const publicFetchLastResultRef = useRef<PublicCenarioPayload | null>(null);
  const publicFetchLastAtRef = useRef(0);


  /* ─── Screen Rotation ─── */
  const [screenRotation, setScreenRotation] = useState(0);

  /* ─── Drawing (Pen) ─── */
  const [drawingActive, setDrawingActive] = useState(false);
  const [hasDrawing, setHasDrawing] = useState(false);
  const [drawColor, setDrawColor] = useState("#e1f532");
  const [drawWidth, setDrawWidth] = useState(3);
  const [showDrawOptions, setShowDrawOptions] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const DRAW_COLORS = ["#e1f532", "#ff3b3b", "#3b82f6", "#4ade80", "#f59e0b", "#ffffff"];
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
      ch = supabase.channel(`draw-sync-${effectiveUserId}-${Date.now()}`);
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
  const publicBackoffRef = useRef({ consecutive: 0, BASE: 30000, MAX: 300000 });
  const fetchViaEdgeFunction = useCallback(async (uid: string) => {
    if (!uid) return null;

    const nowMs = Date.now();
    if (publicFetchInFlightRef.current) {
      return publicFetchInFlightRef.current;
    }
    const bo = publicBackoffRef.current;
    const jitter = Math.random() * 5000;
    const minGap = Math.min(bo.BASE * Math.pow(2, bo.consecutive), bo.MAX) + jitter;
    if (publicFetchLastResultRef.current && nowMs - publicFetchLastAtRef.current < Math.min(minGap, 25000)) {
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
      if (_activeTab) setActiveTab(_activeTab);
      if (_weatherSubTab) setWeatherSubTab(_weatherSubTab);
      if (_currencySubTab) setCurrencySubTab(_currencySubTab);
      if (typeof _screenRotation === "number") setScreenRotation(_screenRotation);
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
        if (result?.currentProgram) {
          setCurrentProgram(result.currentProgram);
          setSponsorLogos(result.sponsorLogos || []);
          setNextProgram(result.nextProgram || null);
        } else {
          setCurrentProgram(null);
          setSponsorLogos([]);
          setNextProgram(null);
        }

        if (result?.musicData?.titulo && result.musicData.titulo !== "Sem título") {
          void setMusicWithCoverFallbackRef.current?.(
            result.musicData.titulo,
            result.musicData.artista || "",
            result.musicData.capa || "",
            undefined,
            result.musicStartTime || null
          );
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
          if (result?.currentProgram) {
            setCurrentProgram(result.currentProgram);
            setSponsorLogos(result.sponsorLogos || []);
            setNextProgram(result.nextProgram || null);
          }
          if (result?.musicData?.titulo && result.musicData.titulo !== "Sem título") {
            void setMusicWithCoverFallbackRef.current?.(
              result.musicData.titulo,
              result.musicData.artista || "",
              result.musicData.capa || "",
              undefined,
              result.musicStartTime || null
            );
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
      const { data: progs } = await supabase.from("programas").select("id, nome, selo, horario_inicio, horario_fim, dias_semana, apresentador_id, apresentadores_ids, tipo_programa").eq("user_id", effectiveUserId).eq("ativo", true);
      const onAir = progs?.find(p => (p.dias_semana || []).includes(today) && p.horario_inicio <= nowTime && p.horario_fim > nowTime);
      if (onAir) {
        let apresentadorNome = "";
        const apIds = onAir.apresentadores_ids?.length ? onAir.apresentadores_ids : onAir.apresentador_id ? [onAir.apresentador_id] : [];
        if (apIds.length) {
          const { data: aps } = await supabase.from("apresentadores").select("nome").in("id", apIds);
          apresentadorNome = aps?.map(a => a.nome).join(", ") || "";
        }
        setCurrentProgram({ nome: onAir.nome, id: onAir.id, selo: onAir.selo, horario_inicio: onAir.horario_inicio, horario_fim: onAir.horario_fim, apresentador: apresentadorNome, tipo_programa: onAir.tipo_programa });
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

  /* Fetch weather */
  const weatherCity = config.weather.city || config.city;
  const weatherFetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!weatherCity) return;
    if (weatherFetchRef.current) clearTimeout(weatherFetchRef.current);
    weatherFetchRef.current = setTimeout(async () => {
      try {
        const { data: geoData } = await supabase.functions.invoke("fetch-weather", { body: { action: "geocode", query: weatherCity, count: 1 } });
        const results = geoData?.results;
        if (!results?.length) return;
        const { latitude, longitude } = results[0];
        setWeatherCoords({ lat: latitude, lon: longitude });
        if (config.weather.enabled) {
          const { data: forecastData } = await supabase.functions.invoke("fetch-weather", { body: { action: "forecast", lat: latitude, lon: longitude, forecast_days: 5 } });
          if (forecastData?.ok && forecastData.data) {
            const d = forecastData.data;
            setLiveWeather({
              current: { temp: Math.round(d.current?.temperature_2m ?? 0), humidity: Math.round(d.current?.relative_humidity_2m ?? 0), code: d.current?.weather_code ?? 0 },
              daily: (d.daily?.time || []).map((date: string, i: number) => ({ date, min: Math.round(d.daily.temperature_2m_min?.[i] ?? 0), max: Math.round(d.daily.temperature_2m_max?.[i] ?? 0), code: d.daily.weather_code?.[i] ?? 0, humidity: Math.round(d.daily.relative_humidity_2m_max?.[i] ?? 0), precip: Math.round(d.daily.precipitation_probability_max?.[i] ?? 0) })),
            });
          }
        }
      } catch { /* silent */ }
    }, 500);
    return () => { if (weatherFetchRef.current) clearTimeout(weatherFetchRef.current); };
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
      if (key === prevMusicRef.current) return;
      prevMusicRef.current = key;
      let finalCapa = capa;
      if (!finalCapa) {
        finalCapa = await fetchItunesCover(titulo, artista);
      }
      setMusicData({ titulo, artista, capa: finalCapa, duracao });
      musicStartRef.current = startTime || Date.now();
      setMusicElapsed(startTime ? Math.floor((Date.now() - startTime) / 1000) : 0);
      setMusicKey(k => k + 1);
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
                  "",
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
            if (items.music_current_title && items.music_current_title !== "Sem título") {
              await setMusicWithCoverFallback(items.music_current_title, items.music_current_artist || "", "", undefined, items.music_start_time || null);
            }
          } else {
            const result = await fetchViaEdgeFunction(effectiveUserId);
            if (result?.musicData?.titulo && result.musicData.titulo !== "Sem título") {
              await setMusicWithCoverFallback(result.musicData.titulo, result.musicData.artista, result.musicData.capa || "", undefined, result.musicStartTime);
            }
          }
        } catch { /* silent */ }
      })();
    }

    // ─── 4. Unauthenticated polling is centralized in config effect to avoid duplicate backend calls ───
    let fallbackInterval: ReturnType<typeof setInterval> | null = null;

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
  const isClockwiseLandscape = screenRotation === 90;
  // Always use vh for consistent sizing — vw is ~1.8x larger on 16:9 screens and causes text overflow
  const vu = "vh";

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
      <div
        className="relative"
        style={{
          ...(isLandscape
            ? { width: "100vh", height: "100vw", transform: `rotate(${screenRotation}deg)`, transition: "transform 0.5s ease" }
            : { width: "calc(100vh * 9 / 16)", height: "100vh", maxHeight: "100vh", transform: `rotate(${screenRotation}deg)`, transition: "transform 0.5s ease" }
          ),
        }}
      >
        <div className="absolute inset-0 flex" style={{ fontSize: "1.8vh" }}>

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

          {!isMapTab && (
            <div className="absolute inset-0" style={{ background: activeTab === "home" && config.home.bgGradient ? buildHomeGradient(config.home) : "#e8e8e8", zIndex: 0 }}>
              {activeTab === "home" && !config.home.bgGradient && config.home.bgImage && <img src={config.home.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
              {activeTab === "weather" && config.weather.bgImage && <img src={config.weather.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
              {activeTab === "traffic" && config.traffic.bgImage && <img src={config.traffic.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
              {activeTab === "currency" && config.currency.bgImage && <img src={config.currency.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
              {activeTab === "chat" && config.chat.bgImage && <img src={config.chat.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
            </div>
          )}

          {/* Sidebar — always on top */}
          <div className="flex-shrink-0 flex items-center relative" style={{ width: isLandscape ? "5%" : "8%", zIndex: 10 }}>
          <div className={`flex flex-col items-center gap-[0.6${vu}] ${isMapTab ? "vmix-blur-4" : ""}`} style={{ padding: `0.5${vu} 0.5${vu}`, borderRadius: `0 2${vu} 2${vu} 0`, background: isMapTab ? "rgba(26,26,26,0.7)" : "rgba(26,26,26,0.85)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.08)", borderLeft: "none", marginLeft: "-1px" }}>
            <button onClick={() => setActiveTab("home")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: `3.8${vu}`, height: `3.8${vu}`, background: "rgba(255,255,255,0.12)", border: activeTab === "home" ? "2px solid #e1f532" : "2px solid transparent", animation: activeTab === "home" ? "cenario-active-blink 1.5s ease-in-out infinite" : "none" }}>
              <Home style={{ width: `1.7${vu}`, height: `1.7${vu}` }} className="text-white" />
            </button>
            <div className="rounded-2xl flex flex-col items-center" style={{ padding: `0.4${vu}`, background: "rgba(255,255,255,0.08)", opacity: config.weather.enabled ? 1 : 0.35 }}>
              <button onClick={() => { if (activeTab === "weather") { setActiveTab("home"); } else { setActiveTab("weather"); setWeatherSubTab("today"); } }} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: `3.8${vu}`, height: `3.8${vu}`, background: "rgba(255,255,255,0.12)", border: activeTab === "weather" ? "2px solid #e1f532" : "2px solid transparent", animation: activeTab === "weather" ? "cenario-active-blink 1.5s ease-in-out infinite" : "none" }}>
                <CloudSun style={{ width: `1.7${vu}`, height: `1.7${vu}` }} className="text-white" />
              </button>
              <div style={{ overflow: "hidden", maxHeight: activeTab === "weather" ? `20${vu}` : "0", transition: "max-height 0.35s cubic-bezier(0.4,0,0.2,1)", opacity: activeTab === "weather" ? 1 : 0 }}>
                <div className="flex flex-col items-center" style={{ gap: `0.4${vu}`, paddingTop: `0.4${vu}` }}>
                  {config.weather.enabled && config.weather.showCurrent && (
                    <button onClick={() => { setActiveTab("weather"); setWeatherSubTab("today"); }} className="rounded-full flex items-center justify-center text-white font-bold cursor-pointer" style={{ width: `2.8${vu}`, height: `2.8${vu}`, fontSize: `1.2${vu}`, background: activeTab === "weather" && weatherSubTab === "today" ? "rgba(225,245,50,0.25)" : "rgba(255,255,255,0.12)", border: activeTab === "weather" && weatherSubTab === "today" ? "1px solid rgba(225,245,50,0.5)" : "1px solid transparent" }}>1</button>
                  )}
                  {config.weather.enabled && config.weather.showForecast3Days && (
                    <button onClick={() => { setActiveTab("weather"); setWeatherSubTab("forecast"); }} className="rounded-full flex items-center justify-center text-white font-bold cursor-pointer" style={{ width: `2.8${vu}`, height: `2.8${vu}`, fontSize: `1.2${vu}`, background: activeTab === "weather" && weatherSubTab === "forecast" ? "rgba(225,245,50,0.25)" : "rgba(255,255,255,0.12)", border: activeTab === "weather" && weatherSubTab === "forecast" ? "1px solid rgba(225,245,50,0.5)" : "1px solid transparent" }}>2</button>
                  )}
                  {config.weather.enabled && config.weather.showSatellite && (
                    <button onClick={() => { setActiveTab("weather"); setWeatherSubTab("satellite"); }} className="rounded-full flex items-center justify-center text-white font-bold cursor-pointer" style={{ width: `2.8${vu}`, height: `2.8${vu}`, fontSize: `1.2${vu}`, background: activeTab === "weather" && weatherSubTab === "satellite" ? "rgba(225,245,50,0.25)" : "rgba(255,255,255,0.12)", border: activeTab === "weather" && weatherSubTab === "satellite" ? "1px solid rgba(225,245,50,0.5)" : "1px solid transparent" }}>3</button>
                  )}
                </div>
              </div>
            </div>
            <button onClick={() => setActiveTab("traffic")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: `3.8${vu}`, height: `3.8${vu}`, marginTop: `0.5${vu}`, background: "rgba(255,255,255,0.12)", opacity: config.traffic.enabled ? 1 : 0.35, border: activeTab === "traffic" ? "2px solid #e1f532" : "2px solid transparent", animation: activeTab === "traffic" ? "cenario-active-blink 1.5s ease-in-out infinite" : "none" }}>
              <Car style={{ width: `1.7${vu}`, height: `1.7${vu}` }} className="text-white" />
            </button>
            <div className="rounded-2xl flex flex-col items-center" style={{ padding: `0.4${vu}`, background: "rgba(255,255,255,0.08)", opacity: config.currency.enabled ? 1 : 0.35 }}>
              <button onClick={() => { if (activeTab === "currency") { setActiveTab("home"); } else { setActiveTab("currency"); setCurrencySubTab("moedas"); } }} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: `3.8${vu}`, height: `3.8${vu}`, background: "rgba(255,255,255,0.12)", border: activeTab === "currency" ? "2px solid #e1f532" : "2px solid transparent", animation: activeTab === "currency" ? "cenario-active-blink 1.5s ease-in-out infinite" : "none" }}>
                <DollarSign style={{ width: `1.7${vu}`, height: `1.7${vu}` }} className="text-white" />
              </button>
              <div style={{ overflow: "hidden", maxHeight: activeTab === "currency" ? `10${vu}` : "0", transition: "max-height 0.4s cubic-bezier(0.4,0,0.2,1)", opacity: activeTab === "currency" ? 1 : 0 }}>
                <div className="flex flex-col items-center" style={{ gap: `0.4${vu}`, paddingTop: `0.4${vu}` }}>
                  {config.currency.enabled && (
                    <button onClick={() => { setActiveTab("currency"); setCurrencySubTab("moedas"); }} className="rounded-full flex items-center justify-center text-white font-bold cursor-pointer" style={{ width: `2.8${vu}`, height: `2.8${vu}`, fontSize: `1.2${vu}`, background: activeTab === "currency" && currencySubTab === "moedas" ? "rgba(225,245,50,0.25)" : "rgba(255,255,255,0.12)", border: activeTab === "currency" && currencySubTab === "moedas" ? "1px solid rgba(225,245,50,0.5)" : "1px solid transparent" }}>1</button>
                  )}
                  {config.currency.enabled && (
                    <button onClick={() => { setActiveTab("currency"); setCurrencySubTab("bolsas"); }} className="rounded-full flex items-center justify-center text-white font-bold cursor-pointer" style={{ width: `2.8${vu}`, height: `2.8${vu}`, fontSize: `1.2${vu}`, background: activeTab === "currency" && currencySubTab === "bolsas" ? "rgba(225,245,50,0.25)" : "rgba(255,255,255,0.12)", border: activeTab === "currency" && currencySubTab === "bolsas" ? "1px solid rgba(225,245,50,0.5)" : "1px solid transparent" }}>2</button>
                  )}
                </div>
              </div>
            </div>
            <button onClick={() => setActiveTab("chat")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: `3.8${vu}`, height: `3.8${vu}`, background: "rgba(255,255,255,0.15)", opacity: config.chat.enabled ? 1 : 0.35, border: activeTab === "chat" ? "2px solid #e1f532" : "2px solid transparent", animation: activeTab === "chat" ? "cenario-active-blink 1.5s ease-in-out infinite" : "none" }}>
              <MessageCircle style={{ width: `1.7${vu}`, height: `1.7${vu}` }} className="text-white" />
            </button>
            <button onClick={() => { setDrawingActive(p => { const next = !p; if (!next) setShowDrawOptions(false); return next; }); }} onContextMenu={(e) => { e.preventDefault(); if (drawingActive) setShowDrawOptions(p => !p); }} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: `3.8${vu}`, height: `3.8${vu}`, marginTop: `0.5${vu}`, background: drawingActive ? "rgba(225,245,50,0.25)" : "rgba(255,255,255,0.12)", border: drawingActive ? "2px solid #e1f532" : "2px solid transparent", transition: "all 0.2s ease" }}>
              <Pen style={{ width: `1.7${vu}`, height: `1.7${vu}` }} className="text-white" />
            </button>
            {drawingActive && (
              <button onClick={() => setShowDrawOptions(p => !p)} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: `2.8${vu}`, height: `2.8${vu}`, background: showDrawOptions ? "rgba(225,245,50,0.25)" : "rgba(255,255,255,0.12)", border: showDrawOptions ? "1px solid rgba(225,245,50,0.5)" : "1px solid transparent", transition: "all 0.2s ease" }}>
                <div style={{ width: `1.2${vu}`, height: `1.2${vu}`, borderRadius: "50%", background: drawColor }} />
              </button>
            )}
          </div>
          </div>

          {/* Drawing options panel */}
          {drawingActive && showDrawOptions && (
            <div className="absolute flex flex-col items-center gap-[0.8vh] rounded-2xl" style={{ left: "9.5%", top: "50%", transform: "translateY(-50%)", zIndex: 45, padding: "1.2vh 0.8vh", background: "rgba(20,20,20,0.85)", WebkitBackdropFilter: "blur(12px)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.15)" }}>
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
              className="absolute inset-0"
              style={{ animation: "cenario-page-enter 0.5s cubic-bezier(0.16,1,0.3,1) both" }}
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

              const isMusical = false; // unused in new layout but kept for reference
              const showMusicHero = false;

              // ── Program info block (reused in both layouts) ──
              const programInfoBlock = currentProgram && (
                <div
                  key={`info-${currentProgram.id}`}
                  className="text-center"
                  style={{ animation: "cenario-program-slide-in 0.7s cubic-bezier(0.16,1,0.3,1) 0.1s both" }}
                >
                  {!currentProgram.selo && (
                    <div className="font-bold drop-shadow-md" style={{ fontSize: `${isLandscape ? 2.5 : 3.5}${vu}`, marginBottom: `0.5${vu}`, color: "#fff" }}>{currentProgram.nome}</div>
                  )}
                  <div className="opacity-70 font-medium" style={{ fontSize: `${isLandscape ? 1.2 : 1.6}${vu}`, color: "#fff" }}>
                    {currentProgram.horario_inicio.slice(0,5)} — {currentProgram.horario_fim.slice(0,5)}
                  </div>
                  <div className="mx-auto" style={{ width: `${isLandscape ? 15 : 25}${vu}`, height: `0.4${vu}`, marginTop: `0.8${vu}`, borderRadius: `1${vu}`, background: "rgba(255,255,255,0.2)", overflow: "hidden" }}>
                    <div style={{ width: `${progressPct}%`, height: "100%", borderRadius: `1${vu}`, background: "#e1f532", transition: "width 1s linear", boxShadow: "0 0 8px rgba(225,245,50,0.5)" }} />
                  </div>
                  {currentProgram.apresentador && (
                    <div className="flex items-center justify-center opacity-80" style={{ gap: `0.5${vu}`, marginTop: `0.8${vu}`, animation: "cenario-program-slide-in 0.6s cubic-bezier(0.16,1,0.3,1) 0.2s both" }}>
                      <Mic style={{ width: `1.2${vu}`, height: `1.2${vu}`, color: "#e1f532" }} />
                      <span style={{ fontSize: `1.2${vu}`, color: "#fff", fontWeight: 500 }}>{currentProgram.apresentador}</span>
                    </div>
                  )}
                </div>
              );

              // Layout is the same for all rotations (portrait code below handles everything)
              // ── PORTRAIT (original vertical layout) ──
              return (
                <div className="absolute inset-0 flex flex-col" style={{ padding: `2${vu} 1.5${vu} 1.5${vu} 1.5${vu}`, color: "#fff" }}>

                  {/* TOP ROW: Clock + Date (left) / Next program (right) */}
                  <div className="flex justify-between items-start flex-shrink-0" style={{ zIndex: 2, padding: `0 0.5${vu}`, marginTop: isLandscape ? "100px" : undefined, animation: "cenario-clock-enter 0.6s cubic-bezier(0.16,1,0.3,1) both" }}>
                    <div>
                      <div className="font-black" style={{ fontSize: `4${vu}`, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em", lineHeight: 1, textShadow: "0 2px 12px rgba(0,0,0,0.4)" }}>
                        {currentTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </div>
                      <div className="font-bold" style={{ fontSize: `1.4${vu}`, color: "#e1f532", marginTop: `0.3${vu}` }}>
                        {currentTime.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}
                      </div>
                      <div className="flex items-center" style={{ gap: `0.4${vu}`, marginTop: `0.4${vu}`, opacity: 0.7 }}>
                        <div className="rounded-full" style={{ width: `0.7${vu}`, height: `0.7${vu}`, background: realtimeConnected ? "#4ade80" : "#ef4444", boxShadow: realtimeConnected ? "0 0 4px #4ade80" : "0 0 4px #ef4444" }} />
                        <span className="text-white font-semibold uppercase tracking-wider" style={{ fontSize: `0.9${vu}` }}>
                          {realtimeConnected ? "SYNC" : "OFF"}
                        </span>
                      </div>
                    </div>
                    {nextProgram && (
                      <div className="text-right" style={{ animation: "cenario-slide-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.3s both", lineHeight: 1.2, marginRight: "80px" }}>
                        <div className="font-medium" style={{ fontSize: `${1.2 * 1.5}${vu}`, color: "#e1f532" }}>a seguir</div>
                        <div className="font-bold" style={{ fontSize: `${1.6 * 1.5}${vu}` }}>{nextProgram.nome}</div>
                        <div className="opacity-50 font-medium" style={{ fontSize: `${1.1 * 1.5}${vu}`, fontVariantNumeric: "tabular-nums" }}>{nextProgram.horario_inicio.slice(0,5)}</div>
                      </div>
                    )}
                  </div>

                  {/* CENTER: Music card */}
                  <div className="flex-1 flex flex-col items-center justify-center" style={{ overflow: "hidden" }}>
                    {(() => {
                      const isJornalistico = currentProgram?.tipo_programa?.toLowerCase().includes("jornal");
                      if (isJornalistico && currentProgram) {
                        // Jornalístico: show program logo instead of music cover
                        return (
                          <div
                            key={`jornal-${currentProgram.id}`}
                            className="flex flex-col items-center"
                            style={{
                              width: "85%",
                              maxWidth: `${isLandscape ? 59 : 42}${vu}`,
                              padding: `1.5${vu} 2${vu} 2${vu}`,
                              borderRadius: `2${vu}`,
                              background: "rgba(0,0,0,0.5)",
                              WebkitBackdropFilter: "blur(16px)", backdropFilter: "blur(16px)",
                              border: "2px solid rgba(225,245,50,0.15)",
                              animation: "cenario-cover-in 0.6s cubic-bezier(0.16,1,0.3,1) both",
                            }}
                          >
                            {currentProgram.selo ? (
                              <div className="relative flex items-center justify-center" style={{ width: "100%", paddingBottom: "100%", borderRadius: `1.2${vu}`, marginBottom: `1.2${vu}`, overflow: "hidden", background: "rgba(0,0,0,0.3)", border: "1px solid rgba(255,255,255,0.18)", boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.1)", position: "relative" }}>
                                <img src={currentProgram.selo} alt={currentProgram.nome} className="object-contain" style={{ position: "absolute", top: "10%", left: "10%", width: "80%", height: "80%" }} />
                              </div>
                            ) : (
                              <div className="flex items-center justify-center" style={{ width: "100%", paddingBottom: "100%", borderRadius: `1.2${vu}`, marginBottom: `1.2${vu}`, background: "rgba(255,255,255,0.08)", position: "relative" }}>
                                <div className="font-black text-center text-white" style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", fontSize: `4${vu}`, lineHeight: 1.1 }}>{currentProgram.nome}</div>
                              </div>
                            )}
                            {musicData && (
                              <>
                                <div className="flex items-center self-start" style={{ gap: `1${vu}`, maxWidth: "100%" }}>
                                  <Play style={{ width: `2.2${vu}`, height: `2.2${vu}`, color: "#e1f532", flexShrink: 0, fill: "#e1f532", filter: "drop-shadow(0 0 6px rgba(225,245,50,0.7))", animation: "cenario-active-blink 1.5s ease-in-out infinite" }} />
                                  <div style={{ overflow: "hidden", minWidth: 0 }}>
                                    <div className="font-black uppercase truncate text-white" style={{ fontSize: `2${vu}`, letterSpacing: "0.03em", lineHeight: 1.2 }}>{musicData.titulo}</div>
                                    <div className="font-bold uppercase truncate" style={{ fontSize: `1.5${vu}`, color: "#e1f532", letterSpacing: "0.05em", lineHeight: 1.3 }}>{musicData.artista}</div>
                                  </div>
                                </div>
                                {(() => {
                                  const dur = musicData.duracao || 240;
                                  const pct = Math.min(100, (musicElapsed / dur) * 100);
                                  const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
                                  return (
                                    <>
                                      <div className="flex justify-between w-full opacity-60" style={{ fontSize: `0.9${vu}`, marginTop: `0.8${vu}`, fontVariantNumeric: "tabular-nums", color: "#fff" }}>
                                        <span>{fmtTime(musicElapsed)}</span>
                                        <span>{fmtTime(dur)}</span>
                                      </div>
                                      <div style={{ width: "100%", height: `0.4${vu}`, marginTop: `0.3${vu}`, borderRadius: `1${vu}`, background: "rgba(255,255,255,0.15)", overflow: "hidden" }}>
                                        <div style={{ width: `${pct}%`, height: "100%", borderRadius: `1${vu}`, background: "#e1f532", transition: "width 1s linear", boxShadow: "0 0 6px rgba(225,245,50,0.4)" }} />
                                      </div>
                                    </>
                                  );
                                })()}
                              </>
                            )}
                          </div>
                        );
                      }

                      // Default: music card with cover
                      if (musicData) {
                        return (
                          <div
                            key={musicKey}
                            className="flex flex-col items-center"
                            style={{
                              width: "85%",
                              maxWidth: `${isLandscape ? 59 : 42}${vu}`,
                              padding: `1.8${vu} 2.2${vu} 2.2${vu}`,
                              borderRadius: `2.4${vu}`,
                              background: "rgba(10,10,10,0.35)",
                              WebkitBackdropFilter: "blur(24px)", backdropFilter: "blur(24px)",
                              border: "1px solid rgba(255,255,255,0.08)",
                              boxShadow: "0 24px 64px -12px rgba(0,0,0,0.5), 0 8px 24px -8px rgba(0,0,0,0.3)",
                              animation: "cenario-cover-in 0.6s cubic-bezier(0.16,1,0.3,1) both",
                            }}
                          >
                            {musicData.capa ? (
                            <div className="relative" style={{ width: "100%", paddingBottom: "100%", borderRadius: `1.6${vu}`, marginBottom: `1.4${vu}`, overflow: "hidden", boxShadow: "0 16px 48px -8px rgba(0,0,0,0.45)" }}>
                                <img src={musicData.capa} alt="" className="object-cover" style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }} />
                              </div>
                            ) : (
                              <div className="flex items-center justify-center" style={{ width: "100%", paddingBottom: "100%", borderRadius: `1.2${vu}`, marginBottom: `1.2${vu}`, background: "rgba(255,255,255,0.08)", position: "relative" }}>
                                <Music style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: `8${vu}`, height: `8${vu}`, opacity: 0.3, color: "#fff" }} />
                              </div>
                            )}
                            <div className="flex items-center self-start" style={{ gap: `1${vu}`, maxWidth: "100%" }}>
                              <Play style={{ width: `2.2${vu}`, height: `2.2${vu}`, color: "#e1f532", flexShrink: 0, fill: "#e1f532", filter: "drop-shadow(0 0 6px rgba(225,245,50,0.7))", animation: "cenario-active-blink 1.5s ease-in-out infinite" }} />
                              <div style={{ overflow: "hidden", minWidth: 0 }}>
                                <div className="font-black uppercase truncate" style={{ fontSize: `2${vu}`, letterSpacing: "0.03em", lineHeight: 1.2 }}>{musicData.titulo}</div>
                                <div className="font-bold uppercase truncate" style={{ fontSize: `1.5${vu}`, color: "#e1f532", letterSpacing: "0.05em", lineHeight: 1.3 }}>{musicData.artista}</div>
                              </div>
                            </div>
                            {(() => {
                              const dur = musicData.duracao || 240;
                              const pct = Math.min(100, (musicElapsed / dur) * 100);
                              const fmtTime = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
                              return (
                                <>
                                  <div className="flex justify-between w-full opacity-60" style={{ fontSize: `0.9${vu}`, marginTop: `0.8${vu}`, fontVariantNumeric: "tabular-nums" }}>
                                    <span>{fmtTime(musicElapsed)}</span>
                                    <span>{fmtTime(dur)}</span>
                                  </div>
                                  <div style={{ width: "100%", height: `0.4${vu}`, marginTop: `0.3${vu}`, borderRadius: `1${vu}`, background: "rgba(255,255,255,0.15)", overflow: "hidden" }}>
                                    <div style={{ width: `${pct}%`, height: "100%", borderRadius: `1${vu}`, background: "#e1f532", transition: "width 1s linear", boxShadow: "0 0 6px rgba(225,245,50,0.4)" }} />
                                  </div>
                                </>
                              );
                            })()}
                          </div>
                        );
                      }

                      if (!currentProgram) {
                        return <div className="opacity-40 text-center" style={{ fontSize: `1.8${vu}` }}>Nenhum programa no ar</div>;
                      }
                      return null;
                    })()}
                  </div>

                  {/* BOTTOM: Program logo + presenter + schedule */}
                  {currentProgram && (
                    <div
                      key={`program-${currentProgram.id}`}
                      className="flex flex-col items-center flex-shrink-0"
                      style={{ marginTop: "120px", animation: "cenario-program-slide-in 0.7s cubic-bezier(0.16,1,0.3,1) both" }}
                    >
                      {currentProgram.selo ? (
                        <img src={currentProgram.selo} alt={currentProgram.nome} className="object-contain drop-shadow-lg" style={{ maxWidth: `40${vu}`, maxHeight: `25${vu}` }} />
                      ) : (
                        <div className="font-black text-center" style={{ fontSize: `3${vu}`, lineHeight: 1.1 }}>{currentProgram.nome}</div>
                      )}
                      {currentProgram.apresentador && (
                        <div className="font-bold" style={{ fontSize: `2.2${vu}`, marginTop: `0.6${vu}`, textShadow: "0 2px 8px rgba(0,0,0,0.3)" }}>{currentProgram.apresentador}</div>
                      )}
                      <div className="font-medium" style={{ fontSize: `1.3${vu}`, marginTop: `0.3${vu}`, fontVariantNumeric: "tabular-nums", color: "#000", opacity: 0.7 }}>
                        {currentProgram.horario_inicio.slice(0,5)}/{currentProgram.horario_fim.slice(0,5)}
                      </div>
                    </div>
                  )}

                  {/* Full-width program progress bar */}
                  <div className="flex-shrink-0" style={{ width: "100%", height: 10, background: "#000", marginTop: `0.5${vu}` }}>
                    <div style={{ width: `${progressPct}%`, height: "100%", background: "#fff", transition: "width 1s linear" }} />
                  </div>

                  {/* SYNC status below progress bar */}
                  <div className="flex items-center justify-center flex-shrink-0" style={{ gap: `0.5${vu}`, marginTop: `0.5${vu}`, opacity: 0.7 }}>
                    <div className="rounded-full" style={{ width: `0.8${vu}`, height: `0.8${vu}`, background: realtimeConnected ? "#4ade80" : "#ef4444", boxShadow: realtimeConnected ? "0 0 4px #4ade80" : "0 0 4px #ef4444" }} />
                    <span className="text-white font-semibold uppercase tracking-wider" style={{ fontSize: `1.1${vu}` }}>
                      {realtimeConnected ? "SYNC" : "OFF"}
                    </span>
                  </div>

                  {sponsorLogos.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-2" style={{ marginTop: `0.5${vu}`, animation: "cenario-slide-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.5s both" }}>
                      {sponsorLogos.map(l => l.logo_url && <img key={l.id} src={l.logo_url} alt={l.nome} className="object-contain rounded drop-shadow-md" style={{ width: `4${vu}`, height: `4${vu}`, background: "rgba(255,255,255,0.15)", padding: 2 }} />)}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ═══ WEATHER ═══ */}
            {activeTab === "weather" && (
              <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ color: "#fff" }}>
                {!config.weather.bgImage && <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, #0d47a1 0%, #1565c0 25%, #1e88e5 50%, #42a5f5 75%, #90caf9 100%)" }} />}
                <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 70% 20%, rgba(255,255,255,0.15) 0%, transparent 60%)" }} />
                <div className="absolute bottom-0 left-0 right-0 h-1/3" style={{ background: "linear-gradient(to top, rgba(0,0,0,0.3), transparent)" }} />
                <div className={`relative z-10 flex flex-col h-full`} style={{ padding: `${isLandscape ? 2 : 3}${vu}` }}>
                  {liveWeather ? (<>
                    {weatherSubTab === "today" && (<>
                      {isLandscape ? (
                        /* ── LANDSCAPE: horizontal layout ── */
                        <div className="flex-1 flex items-stretch" style={{ gap: `2${vu}` }}>
                          {/* Left: City + big temp */}
                          <div className="flex flex-col justify-center" style={{ flex: "0 0 40%" }}>
                            <div className="font-black leading-none drop-shadow-lg" style={{ fontSize: `3${vu}`, letterSpacing: "-0.02em" }}>{weatherCity || config.city || "Cidade"}</div>
                            <div className="font-bold uppercase tracking-widest" style={{ fontSize: `1.4${vu}`, color: "#e1f532", marginTop: `0.5${vu}` }}>hoje</div>
                            <div className="flex items-center" style={{ gap: `1.5${vu}`, marginTop: `1.5${vu}` }}>
                              <div style={{ width: `10${vu}`, height: `10${vu}`, filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.2))" }}>
                                <WeatherIcon code={liveWeather.current.code} size={112} forceDay />
                              </div>
                              <div>
                                <div className="font-black drop-shadow-lg" style={{ fontSize: `6${vu}`, lineHeight: 1 }}>{liveWeather.current.temp}°</div>
                                <div className="font-medium opacity-90" style={{ fontSize: `1.4${vu}` }}>{getWLabel(liveWeather.current.code)}</div>
                              </div>
                            </div>
                          </div>
                          {/* Right: details card */}
                          <div className="flex-1 rounded-2xl flex flex-col justify-center" style={{ padding: `2${vu}`, background: "rgba(255,255,255,0.12)", WebkitBackdropFilter: "blur(20px)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.2)", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
                            <div className="flex items-center" style={{ gap: `1${vu}`, marginBottom: `1.5${vu}` }}>
                              <Thermometer style={{ width: `2.5${vu}`, height: `2.5${vu}`, opacity: 0.8 }} />
                              <span className="font-bold" style={{ fontSize: `2.2${vu}` }}>Mín {liveWeather.daily[0]?.min ?? "--"}° / Máx {liveWeather.daily[0]?.max ?? "--"}°</span>
                            </div>
                            <div className="flex items-center" style={{ gap: `1${vu}`, marginBottom: `1${vu}` }}>
                              <Droplets style={{ width: `2.5${vu}`, height: `2.5${vu}`, opacity: 0.8 }} />
                              <span className="font-semibold" style={{ fontSize: `2${vu}` }}>Umidade {liveWeather.current.humidity}%</span>
                            </div>
                            <div className="flex items-center" style={{ gap: `1${vu}` }}>
                              <span style={{ fontSize: `2.5${vu}` }}>🌧</span>
                              <span className="font-semibold" style={{ fontSize: `2${vu}` }}>Precipitação {liveWeather.daily[0]?.precip ?? 0}%</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        /* ── PORTRAIT: original vertical layout ── */
                        <>
                      <div className="flex items-start justify-between" style={{ marginBottom: `1.5${vu}` }}>
                        <div>
                          <div className="font-black leading-none drop-shadow-lg" style={{ fontSize: `4.5${vu}`, letterSpacing: "-0.02em" }}>{weatherCity || config.city || "Cidade"}</div>
                          <div className="font-bold uppercase tracking-widest" style={{ fontSize: `1.8${vu}`, color: "#e1f532", marginTop: `0.5${vu}` }}>hoje</div>
                        </div>
                        <div style={{ width: `6${vu}`, height: `6${vu}` }}>
                          <WeatherIcon code={liveWeather.current.code} size={64} />
                        </div>
                      </div>
                      <div className="flex-1 rounded-2xl flex flex-col" style={{ padding: `2.5${vu}`, gap: `2${vu}`, background: "rgba(255,255,255,0.12)", WebkitBackdropFilter: "blur(20px)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.2)", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
                        <div className="flex items-center" style={{ gap: `2${vu}` }}>
                          <div className="drop-shadow-xl" style={{ width: `14${vu}`, height: `14${vu}`, filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.2))" }}>
                            <WeatherIcon code={liveWeather.current.code} size={112} forceDay />
                          </div>
                          <div className="flex flex-col">
                            <div className="font-black drop-shadow-lg" style={{ fontSize: `6${vu}`, lineHeight: 1 }}>{liveWeather.current.temp}°</div>
                            <div className="font-medium opacity-90" style={{ fontSize: `1.6${vu}` }}>{getWLabel(liveWeather.current.code)}</div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between rounded-xl" style={{ padding: `1.5${vu} 2${vu}`, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.1)" }}>
                          <div className="flex items-center" style={{ gap: `0.8${vu}` }}>
                            <Thermometer style={{ width: `2${vu}`, height: `2${vu}`, opacity: 0.8 }} />
                            <span className="font-bold" style={{ fontSize: `2${vu}` }}>{liveWeather.daily[0]?.min ?? "--"}° / {liveWeather.daily[0]?.max ?? "--"}°</span>
                          </div>
                          <div className="flex items-center" style={{ gap: `1.5${vu}`, fontSize: `1.5${vu}` }}>
                            <span className="flex items-center" style={{ gap: `0.4${vu}` }}><Droplets style={{ width: `1.5${vu}`, height: `1.5${vu}`, opacity: 0.8 }} /> {liveWeather.current.humidity}%</span>
                            <span className="flex items-center" style={{ gap: `0.4${vu}` }}>🌧 {liveWeather.daily[0]?.precip ?? 0}%</span>
                          </div>
                        </div>
                      </div>
                        </>
                      )}
                    </>)}
                    {weatherSubTab === "forecast" && (<>
                      <div className="flex items-start justify-between" style={{ marginBottom: `${isLandscape ? 1 : 2}${vu}` }}>
                        <div>
                          <div className="font-black leading-none drop-shadow-lg" style={{ fontSize: `${isLandscape ? 2.5 : 4.5}${vu}`, letterSpacing: "-0.02em" }}>{weatherCity || config.city || "Cidade"}</div>
                          <div className="font-bold uppercase tracking-widest" style={{ fontSize: `${isLandscape ? 1.2 : 1.8}${vu}`, color: "#e1f532", marginTop: `0.3${vu}` }}>próximos dias</div>
                        </div>
                        <CalendarDays style={{ width: `${isLandscape ? 3 : 5}${vu}`, height: `${isLandscape ? 3 : 5}${vu}`, opacity: 0.8 }} />
                      </div>
                      <div className={`flex-1 rounded-2xl flex ${isLandscape ? "flex-row" : "flex-col"}`} style={{ padding: `${isLandscape ? 1 : 2}${vu}`, gap: `${isLandscape ? 1 : 1.5}${vu}`, background: "rgba(255,255,255,0.12)", WebkitBackdropFilter: "blur(20px)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.2)", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
                        {liveWeather.daily.slice(1, isLandscape ? 7 : 4).map((d, i) => (
                          <div key={i} className={`flex items-center justify-between rounded-xl ${isLandscape ? "flex-1 flex-col text-center" : ""}`} style={{ fontSize: `${isLandscape ? 1.4 : 1.8}${vu}`, padding: `${isLandscape ? 1 : 1.5}${vu} ${isLandscape ? 0.8 : 2}${vu}`, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.08)" }}>
                            <span className="font-bold" style={{ width: isLandscape ? "auto" : "30%" }}>{new Date(d.date + "T12:00").toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" })}</span>
                            <div style={{ width: `${isLandscape ? 3.5 : 4}${vu}`, height: `${isLandscape ? 3.5 : 4}${vu}` }}><WeatherIcon code={d.code} size={32} forceDay /></div>
                            <span className="font-semibold" style={{ width: isLandscape ? "auto" : "30%", textAlign: isLandscape ? "center" : "right" }}>↓{d.min}° ↑{d.max}°</span>
                          </div>
                        ))}
                      </div>
                    </>)}
                    {weatherSubTab === "satellite" && null}
                  </>) : (
                    <div className="flex-1 flex items-center justify-center opacity-50" style={{ fontSize: `1.8${vu}` }}>
                      <CloudSun size={24} className="mr-1" /> {weatherCity ? "Carregando..." : "Configure uma cidade"}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══ TRAFFIC ═══ */}
            {activeTab === "traffic" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ padding: `3${vu}` }}>
                {config.traffic.enabled && trafficCoords ? null : (
                  <div className="opacity-50" style={{ color: "#333", fontSize: `1.8${vu}` }}>Trânsito desativado</div>
                )}
              </div>
            )}

            {/* ═══ CURRENCY ═══ */}
            {activeTab === "currency" && (
              <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ color: "#fff" }}>
                {config.currency.bgImage && <div className="absolute inset-0" style={{ background: "rgba(3,8,14,0.3)" }} />}
                <div className="relative z-10 flex flex-col h-full" style={{ padding: `${isLandscape ? 2 : 3}${vu}` }}>
                    {config.currency.enabled ? (<>
                    <div className="flex items-center justify-between" style={{ marginBottom: `${isLandscape ? 0.8 : 1.6}${vu}` }}>
                      <div>
                        <div className="font-extrabold leading-tight drop-shadow-lg cenario-anim-title" style={{ fontSize: `${isLandscape ? 2.5 : 4.2}${vu}` }}>cotação</div>
                        <div className="font-bold cenario-anim-subtitle" style={{ fontSize: `${isLandscape ? 1.6 : 2.6}${vu}`, color: "#e1f532" }}>
                          {currencySubTab === "moedas" ? "moedas" : "bolsas"}
                        </div>
                      </div>
                      <DollarSign size={isLandscape ? 28 : 48} className="drop-shadow-lg cenario-anim-icon" style={{ color: "#e1f532" }} />
                    </div>

                    {currencySubTab === "moedas" ? (
                      <div className={`flex-1 flex ${isLandscape ? "flex-row flex-wrap" : "flex-col"} overflow-auto`} style={{ gap: `${isLandscape ? 0.4 : 0.6}${vu}` }}>
                        {config.currency.currencies.map((c, idx) => {
                          const opt = CURRENCY_OPTIONS.find(o => o.value === c);
                          const live = liveCurrencies.find(l => l.code === c);
                          const flagIcon = opt?.flag ? COUNTRY_FLAG_MAP[opt.flag] : "";
                          return (
                            <div key={c} className={`flex items-center cenario-anim-row-${Math.min(idx + 1, 8)}`} style={{ padding: `${isLandscape ? 0.8 : 1.2}${vu} ${isLandscape ? 1 : 1.5}${vu}`, borderBottom: "1px solid rgba(255,255,255,0.06)", flex: isLandscape ? "1 1 45%" : "none" }}>
                              <div className="flex items-center" style={{ gap: `${isLandscape ? 0.8 : 1.2}${vu}`, flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: `${isLandscape ? 2.2 : 3}${vu}`, opacity: 0.2, filter: "grayscale(1) brightness(10)", lineHeight: 1 }}>{flagIcon}</span>
                                <div className="flex flex-col" style={{ minWidth: 0 }}>
                                  <span className="font-bold truncate" style={{ fontSize: `${isLandscape ? 1.6 : 2}${vu}`, lineHeight: 1.2 }}>{c}</span>
                                  <span className="truncate" style={{ fontSize: `${isLandscape ? 1 : 1.3}${vu}`, opacity: 0.5, lineHeight: 1.2 }}>{opt?.label?.split("(")[0]?.trim()}</span>
                                </div>
                              </div>
                              {live ? (
                                <div className="flex items-center" style={{ gap: `${isLandscape ? 0.6 : 1}${vu}`, flexShrink: 0 }}>
                                  <span className="font-black tabular-nums" style={{ fontSize: `${isLandscape ? 1.6 : 2.2}${vu}` }}>{live.value}</span>
                                  <div className="flex items-center" style={{ gap: `0.3${vu}` }}>
                                    <span className="font-bold tabular-nums" style={{ fontSize: `${isLandscape ? 1.2 : 1.6}${vu}`, color: live.direction === "up" ? "#4ade80" : live.direction === "down" ? "#f87171" : "rgba(255,255,255,0.5)" }}>{live.change}</span>
                                    {live.direction === "up" && <ChevronUp style={{ width: `${isLandscape ? 1.5 : 2}${vu}`, height: `${isLandscape ? 1.5 : 2}${vu}` }} strokeWidth={3} className="cenario-arrow-up" />}
                                    {live.direction === "down" && <ChevronDown style={{ width: `${isLandscape ? 1.5 : 2}${vu}`, height: `${isLandscape ? 1.5 : 2}${vu}` }} strokeWidth={3} className="cenario-arrow-down" />}
                                  </div>
                                </div>
                              ) : <span className="opacity-30">---</span>}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className={`flex-1 flex ${isLandscape ? "flex-row flex-wrap" : "flex-col"} overflow-auto`} style={{ gap: `${isLandscape ? 0.4 : 0.6}${vu}` }}>
                        {liveStocks.map((s, idx) => {
                          const flagChar = COUNTRY_FLAG_MAP[s.flag?.replace(/[^A-Z]/g, "").slice(0,2)] || s.flag;
                          return (
                            <div key={s.symbol} className={`flex items-center cenario-anim-row-${Math.min(idx + 1, 8)}`} style={{ padding: `${isLandscape ? 0.8 : 1.2}${vu} ${isLandscape ? 1 : 1.5}${vu}`, borderBottom: "1px solid rgba(255,255,255,0.06)", flex: isLandscape ? "1 1 45%" : "none" }}>
                              <div className="flex items-center" style={{ gap: `${isLandscape ? 0.8 : 1.2}${vu}`, flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: `${isLandscape ? 2.2 : 3}${vu}`, opacity: 0.2, filter: "grayscale(1) brightness(10)", lineHeight: 1 }}>{flagChar}</span>
                                <span className="font-bold truncate" style={{ fontSize: `${isLandscape ? 1.6 : 2}${vu}` }}>{s.name}</span>
                              </div>
                              <div className="flex items-center" style={{ gap: `${isLandscape ? 0.6 : 1}${vu}`, flexShrink: 0 }}>
                                <span className="font-black tabular-nums" style={{ fontSize: `${isLandscape ? 1.6 : 2.2}${vu}` }}>{s.value}</span>
                                <div className="flex items-center" style={{ gap: `0.3${vu}` }}>
                                  <span className="font-bold tabular-nums" style={{ fontSize: `${isLandscape ? 1.2 : 1.6}${vu}`, color: s.direction === "up" ? "#4ade80" : s.direction === "down" ? "#f87171" : "rgba(255,255,255,0.5)" }}>{s.change}</span>
                                  {s.direction === "up" && <ChevronUp style={{ width: `${isLandscape ? 1.5 : 2}${vu}`, height: `${isLandscape ? 1.5 : 2}${vu}` }} strokeWidth={3} className="cenario-arrow-up" />}
                                  {s.direction === "down" && <ChevronDown style={{ width: `${isLandscape ? 1.5 : 2}${vu}`, height: `${isLandscape ? 1.5 : 2}${vu}` }} strokeWidth={3} className="cenario-arrow-down" />}</div>
                              </div>
                            </div>
                          );
                        })}
                        {!liveStocks.length && (
                          <div className="opacity-60 text-center" style={{ fontSize: `1.8${vu}` }}>Dados indisponíveis</div>
                        )}
                      </div>
                    )}
                  </>) : (
                    <div className="flex-1 flex items-center justify-center opacity-70" style={{ fontSize: `1.9${vu}` }}>Cotação desativada</div>
                  )}
                </div>
              </div>
            )}

            {/* ═══ CHAT ═══ */}
            {activeTab === "chat" && (
              <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ color: "#fff" }}>
                {!config.chat.bgImage && <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 100%)" }} />}
                <div className="absolute bottom-0 left-0 right-0 h-1/4" style={{ background: "linear-gradient(to top, rgba(200,230,0,0.25), transparent)" }} />
                <div className="relative z-10 flex flex-col h-full" style={{ padding: `3${vu}` }}>
                  {config.chat.enabled ? (<>
                    <div className="flex justify-end mb-1"><MessageCircle size={isLandscape ? 32 : 48} className="drop-shadow-lg" style={{ color: "#e1f532" }} /></div>
                    <div style={{ marginBottom: `2${vu}` }}>
                      <div className="font-extrabold leading-tight drop-shadow-lg" style={{ fontSize: `${isLandscape ? 3 : 4}${vu}` }}>mensagens</div>
                      <div className="font-bold" style={{ fontSize: `${isLandscape ? 1.8 : 2.5}${vu}`, color: "#e1f532" }}>chat</div>
                    </div>
                    <div className="flex-1 rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.12)", WebkitBackdropFilter: "blur(12px)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.15)" }}>
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
                          <div className="flex-1 flex items-center justify-center opacity-50 h-full" style={{ fontSize: `1.8${vu}` }}>
                            Insira a URL da live para carregar o chat
                          </div>
                        );
                      })()}
                    </div>
                  </>) : (
                    <div className="flex-1 flex items-center justify-center opacity-50" style={{ fontSize: `1.8${vu}` }}>Chat desativado</div>
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

          </div>
        </div>
      </div>
    </div>
  );
}
