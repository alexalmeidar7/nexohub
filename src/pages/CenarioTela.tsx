import { useState, useEffect, useRef, useCallback } from "react";
import { Home, CloudSun, Car, DollarSign, MessageCircle, Thermometer, Droplets, CalendarDays, TrendingUp, TrendingDown, Minus, Loader2, ChevronUp, ChevronDown, Pen, Eraser, Clock, Music } from "lucide-react";
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

  /* ─── Supabase Realtime Presence for "telas conectadas" ─── */
  useEffect(() => {
    if (!effectiveUserId) return;
    const ch = supabase.channel(`cenario-presence-${effectiveUserId}`, { config: { presence: { key: "tela-externa" } } });
    ch.on("presence", { event: "join" }, ({ key }) => {
      if (key === "painel-controle" && !presenceShownRef.current) {
        presenceShownRef.current = true;
        setShowConnectedMsg(true);
        setTimeout(() => setShowConnectedMsg(false), 4000);
      }
    });
    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ screen: "tela-externa", ts: Date.now() });
      }
    });
    return () => { supabase.removeChannel(ch); };
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
  const [currentProgram, setCurrentProgram] = useState<{ nome: string; id: string; selo?: string | null; horario_inicio: string; horario_fim: string } | null>(null);
  const [sponsorLogos, setSponsorLogos] = useState<{ id: string; nome: string; logo_url: string }[]>([]);
  const [liveWeather, setLiveWeather] = useState<LiveWeather | null>(null);
  const [weatherCoords, setWeatherCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [trafficCoords, setTrafficCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [liveCurrencies, setLiveCurrencies] = useState<LiveCurrency[]>([]);
  const [satelliteZoom, setSatelliteZoom] = useState(6);
  const [musicData, setMusicData] = useState<{ titulo: string; artista: string; capa: string } | null>(null);
  const [musicKey, setMusicKey] = useState(0);
  const prevMusicRef = useRef("");


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
    const ch = supabase.channel(`draw-sync-${effectiveUserId}`);
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
    }).subscribe();
    rtDrawChannelRef.current = ch;
    return () => { supabase.removeChannel(ch); rtDrawChannelRef.current = null; };
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
    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    return () => ro.disconnect();
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

  /* Load cached config first (works even without auth token in new tab) */
  useEffect(() => {
    try {
      const raw = localStorage.getItem("cenario_interativo_config_cache_v1");
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<CenarioConfig>;
      if (parsed && typeof parsed === "object") {
        setConfig(prev => ({ ...prev, ...parsed }));
      }
    } catch {
      // silent
    }
  }, []);

  /* Load config from DB + subscribe to realtime changes */
  const initialTabLoaded = useRef(false);
  useEffect(() => {
    if (!effectiveUserId) return;

    const applyConfig = (raw: any, fromRealtime = false) => {
      if (!raw || typeof raw !== "object") return;
      const { _activeTab, _weatherSubTab, _currencySubTab, ...rest } = raw;
      const merged = { ...defaultConfig, ...rest };
      setConfig(merged);
      if (_activeTab) setActiveTab(_activeTab);
      if (_weatherSubTab) setWeatherSubTab(_weatherSubTab);
      if (_currencySubTab) setCurrencySubTab(_currencySubTab);
      if (fromRealtime) setLastSyncTime(new Date());
      try {
        localStorage.setItem("cenario_interativo_config_cache_v1", JSON.stringify(merged));
      } catch { /* silent */ }
    };

    // Initial load
    const load = async () => {
      const { data } = await supabase.from("user_settings").select("cenario_config" as any).eq("user_id", effectiveUserId).maybeSingle();
      if ((data as any)?.cenario_config) {
        applyConfig((data as any).cenario_config);
      }
    };
    load();

    // Realtime subscription for cross-computer sync
    const channel = supabase
      .channel(`cenario-sync-${effectiveUserId}`)
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
      });

    return () => { setRealtimeConnected(false); supabase.removeChannel(channel); };
  }, [effectiveUserId]);

  /* Keep cache synced */
  useEffect(() => {
    try {
      localStorage.setItem("cenario_interativo_config_cache_v1", JSON.stringify(config));
    } catch {
      // silent
    }
  }, [config]);

  /* Fetch current program + sponsor logos */
  useEffect(() => {
    if (!effectiveUserId) return;
    const load = async () => {
      const now = new Date();
      const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      const today = dayNames[now.getDay()];
      const nowTime = now.toTimeString().slice(0, 5);
      const { data: progs } = await supabase.from("programas").select("id, nome, selo, horario_inicio, horario_fim, dias_semana").eq("user_id", effectiveUserId).eq("ativo", true);
      const onAir = progs?.find(p => (p.dias_semana || []).includes(today) && p.horario_inicio <= nowTime && p.horario_fim > nowTime);
      if (onAir) {
        setCurrentProgram({ nome: onAir.nome, id: onAir.id, selo: onAir.selo, horario_inicio: onAir.horario_inicio, horario_fim: onAir.horario_fim });
        const { data: logos } = await supabase.from("logos_patrocinadores").select("id, nome, logo_url").eq("programa_id", onAir.id).eq("user_id", effectiveUserId).eq("ativo", true).eq("excluido", false);
        setSponsorLogos(logos || []);
      } else { setCurrentProgram(null); setSponsorLogos([]); }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [effectiveUserId]);

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

  /* ─── Music polling from localStorage ─── */
  useEffect(() => {
    const poll = () => {
      try {
        const raw = localStorage.getItem("masterview_music_data");
        if (!raw) return;
        const d = JSON.parse(raw) as { titulo?: string; artista?: string; capa?: string };
        const key = `${d.titulo || ""}|${d.artista || ""}`;
        if (key !== prevMusicRef.current && d.titulo && d.titulo !== "Sem título") {
          prevMusicRef.current = key;
          setMusicData({ titulo: d.titulo || "", artista: d.artista || "", capa: d.capa || "" });
          setMusicKey(k => k + 1);
        }
      } catch { /* silent */ }
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => clearInterval(interval);
  }, []);

  /* Listen for sync messages from config page via BroadcastChannel */
  useEffect(() => {
    const bc = new BroadcastChannel("cenario-interativo");
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
    // Request current state from the config page
    bc.postMessage({ type: "request-state" });
    return () => { cenarioBcDrawRef.current = null; bc.close(); };
  }, [drawOnCanvas]);

  const isMapTab = (activeTab === "weather" && weatherSubTab === "satellite" && config.weather.showSatellite) || (activeTab === "traffic" && config.traffic.enabled);

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <div className="relative h-full" style={{ aspectRatio: "9/16", maxHeight: "100vh" }}>
        <div className="absolute inset-0 flex" style={{ fontSize: "1.8vh" }}>

          {/* Satellite fullscreen — aligned after sidebar */}
          {activeTab === "weather" && weatherSubTab === "satellite" && config.weather.showSatellite && weatherCoords && (
            <div className="absolute inset-y-0 right-0" style={{ left: "8%", zIndex: 5 }}>
              <SatelliteMap lat={weatherCoords.lat} lon={weatherCoords.lon} zoom={satelliteZoom} showControls onZoomChange={(z) => { setSatelliteZoom(z); cenarioBcDrawRef.current?.postMessage({ type: "zoom-change", zoom: z }); rtDrawChannelRef.current?.send({ type: "broadcast", event: "zoom-change", payload: { zoom: z } }); }} />
            </div>
          )}

          {/* Traffic (Leaflet) fullscreen — aligned after sidebar */}
          {activeTab === "traffic" && config.traffic.enabled && trafficCoords && (
            <div className="absolute inset-y-0 right-0" style={{ left: "8%", zIndex: 1 }}>
              <TrafficMap
                lat={config.traffic.lat ?? trafficCoords.lat}
                lon={config.traffic.lon ?? trafficCoords.lon}
                zoom={config.traffic.zoom}
              />
            </div>
          )}

          {/* Sidebar — always on top */}
          <div className={`flex-shrink-0 flex flex-col items-center justify-center px-[0.5vh] gap-[0.6vh] relative ${isMapTab ? "vmix-blur-4" : ""}`} style={{ width: "8%", background: isMapTab ? "rgba(26,26,26,0.7)" : "#1a1a1a", zIndex: 10 }}>
            <button onClick={() => setActiveTab("home")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: "3.8vh", height: "3.8vh", background: "rgba(255,255,255,0.12)", border: activeTab === "home" ? "2px solid #e1f532" : "2px solid transparent", animation: activeTab === "home" ? "cenario-active-blink 1.5s ease-in-out infinite" : "none" }}>
              <Home style={{ width: "1.7vh", height: "1.7vh" }} className="text-white" />
            </button>
            <div className="rounded-2xl flex flex-col items-center" style={{ padding: "0.4vh", background: "rgba(255,255,255,0.08)", opacity: config.weather.enabled ? 1 : 0.35 }}>
              <button onClick={() => { if (activeTab === "weather") { setActiveTab("home"); } else { setActiveTab("weather"); setWeatherSubTab("today"); } }} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: "3.8vh", height: "3.8vh", background: "rgba(255,255,255,0.12)", border: activeTab === "weather" ? "2px solid #e1f532" : "2px solid transparent", animation: activeTab === "weather" ? "cenario-active-blink 1.5s ease-in-out infinite" : "none" }}>
                <CloudSun style={{ width: "1.7vh", height: "1.7vh" }} className="text-white" />
              </button>
              <div style={{ overflow: "hidden", maxHeight: activeTab === "weather" ? "20vh" : "0", transition: "max-height 0.35s cubic-bezier(0.4,0,0.2,1)", opacity: activeTab === "weather" ? 1 : 0 }}>
                <div>
                  <div className="flex flex-col items-center gap-[0.4vh]" style={{ paddingTop: "0.4vh" }}>
                    {config.weather.enabled && config.weather.showCurrent && (
                      <button onClick={() => { setActiveTab("weather"); setWeatherSubTab("today"); }} className="rounded-full flex items-center justify-center text-white font-bold cursor-pointer" style={{ width: "2.8vh", height: "2.8vh", fontSize: "1.2vh", background: activeTab === "weather" && weatherSubTab === "today" ? "rgba(225,245,50,0.25)" : "rgba(255,255,255,0.12)", border: activeTab === "weather" && weatherSubTab === "today" ? "1px solid rgba(225,245,50,0.5)" : "1px solid transparent", transition: "all 0.2s ease" }}>1</button>
                    )}
                    {config.weather.enabled && config.weather.showForecast3Days && (
                      <button onClick={() => { setActiveTab("weather"); setWeatherSubTab("forecast"); }} className="rounded-full flex items-center justify-center text-white font-bold cursor-pointer" style={{ width: "2.8vh", height: "2.8vh", fontSize: "1.2vh", background: activeTab === "weather" && weatherSubTab === "forecast" ? "rgba(225,245,50,0.25)" : "rgba(255,255,255,0.12)", border: activeTab === "weather" && weatherSubTab === "forecast" ? "1px solid rgba(225,245,50,0.5)" : "1px solid transparent", transition: "all 0.2s ease" }}>2</button>
                    )}
                    {config.weather.enabled && config.weather.showSatellite && (
                      <button onClick={() => { setActiveTab("weather"); setWeatherSubTab("satellite"); }} className="rounded-full flex items-center justify-center text-white font-bold cursor-pointer" style={{ width: "2.8vh", height: "2.8vh", fontSize: "1.2vh", background: activeTab === "weather" && weatherSubTab === "satellite" ? "rgba(225,245,50,0.25)" : "rgba(255,255,255,0.12)", border: activeTab === "weather" && weatherSubTab === "satellite" ? "1px solid rgba(225,245,50,0.5)" : "1px solid transparent", transition: "all 0.2s ease" }}>3</button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <button onClick={() => setActiveTab("traffic")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: "3.8vh", height: "3.8vh", marginTop: "0.5vh", background: "rgba(255,255,255,0.12)", opacity: config.traffic.enabled ? 1 : 0.35, border: activeTab === "traffic" ? "2px solid #e1f532" : "2px solid transparent", animation: activeTab === "traffic" ? "cenario-active-blink 1.5s ease-in-out infinite" : "none" }}>
              <Car style={{ width: "1.7vh", height: "1.7vh" }} className="text-white" />
            </button>
            <div className="rounded-2xl flex flex-col items-center" style={{ padding: "0.4vh", background: "rgba(255,255,255,0.08)", opacity: config.currency.enabled ? 1 : 0.35 }}>
              <button onClick={() => { if (activeTab === "currency") { setActiveTab("home"); } else { setActiveTab("currency"); setCurrencySubTab("moedas"); } }} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: "3.8vh", height: "3.8vh", background: "rgba(255,255,255,0.12)", border: activeTab === "currency" ? "2px solid #e1f532" : "2px solid transparent", animation: activeTab === "currency" ? "cenario-active-blink 1.5s ease-in-out infinite" : "none" }}>
                <DollarSign style={{ width: "1.7vh", height: "1.7vh" }} className="text-white" />
              </button>
              <div style={{ overflow: "hidden", maxHeight: activeTab === "currency" ? "10vh" : "0", transition: "max-height 0.4s cubic-bezier(0.4,0,0.2,1)", opacity: activeTab === "currency" ? 1 : 0 }}>
                <div className="flex flex-col items-center gap-[0.4vh]" style={{ paddingTop: "0.4vh" }}>
                  {config.currency.enabled && (
                    <button onClick={() => { setActiveTab("currency"); setCurrencySubTab("moedas"); }} className="rounded-full flex items-center justify-center text-white font-bold cursor-pointer" style={{ width: "2.8vh", height: "2.8vh", fontSize: "1.2vh", background: activeTab === "currency" && currencySubTab === "moedas" ? "rgba(225,245,50,0.25)" : "rgba(255,255,255,0.12)", border: activeTab === "currency" && currencySubTab === "moedas" ? "1px solid rgba(225,245,50,0.5)" : "1px solid transparent", transition: "all 0.2s ease" }}>1</button>
                  )}
                  {config.currency.enabled && (
                    <button onClick={() => { setActiveTab("currency"); setCurrencySubTab("bolsas"); }} className="rounded-full flex items-center justify-center text-white font-bold cursor-pointer" style={{ width: "2.8vh", height: "2.8vh", fontSize: "1.2vh", background: activeTab === "currency" && currencySubTab === "bolsas" ? "rgba(225,245,50,0.25)" : "rgba(255,255,255,0.12)", border: activeTab === "currency" && currencySubTab === "bolsas" ? "1px solid rgba(225,245,50,0.5)" : "1px solid transparent", transition: "all 0.2s ease" }}>2</button>
                  )}
                </div>
              </div>
            </div>
            <button onClick={() => setActiveTab("chat")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: "3.8vh", height: "3.8vh", background: "rgba(255,255,255,0.15)", opacity: config.chat.enabled ? 1 : 0.35, border: activeTab === "chat" ? "2px solid #e1f532" : "2px solid transparent", animation: activeTab === "chat" ? "cenario-active-blink 1.5s ease-in-out infinite" : "none" }}>
              <MessageCircle style={{ width: "1.7vh", height: "1.7vh" }} className="text-white" />
            </button>
            <button onClick={() => { setDrawingActive(p => { const next = !p; if (!next) setShowDrawOptions(false); return next; }); }} onContextMenu={(e) => { e.preventDefault(); if (drawingActive) setShowDrawOptions(p => !p); }} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: "3.8vh", height: "3.8vh", marginTop: "0.5vh", background: drawingActive ? "rgba(225,245,50,0.25)" : "rgba(255,255,255,0.12)", border: drawingActive ? "2px solid #e1f532" : "2px solid transparent", transition: "all 0.2s ease" }}>
              <Pen style={{ width: "1.7vh", height: "1.7vh" }} className="text-white" />
            </button>
            {drawingActive && (
              <button onClick={() => setShowDrawOptions(p => !p)} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: "2.8vh", height: "2.8vh", background: showDrawOptions ? "rgba(225,245,50,0.25)" : "rgba(255,255,255,0.12)", border: showDrawOptions ? "1px solid rgba(225,245,50,0.5)" : "1px solid transparent", transition: "all 0.2s ease" }}>
                <div style={{ width: "1.2vh", height: "1.2vh", borderRadius: "50%", background: drawColor }} />
              </button>
            )}
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
          <div className="flex-1 relative" style={{ background: isMapTab ? "transparent" : (activeTab === "home" && config.home.bgGradient ? buildHomeGradient(config.home) : "#e8e8e8"), zIndex: 1 }}>
            {/* Bg images */}
            {activeTab === "home" && !config.home.bgGradient && config.home.bgImage && <img src={config.home.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
            {activeTab === "weather" && config.weather.bgImage && <img src={config.weather.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
            {activeTab === "traffic" && config.traffic.bgImage && <img src={config.traffic.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
            {activeTab === "currency" && config.currency.bgImage && <img src={config.currency.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
            {activeTab === "chat" && config.chat.bgImage && <img src={config.chat.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}

            {/* Animated page wrapper */}
            <div
              key={activeTab + (activeTab === "weather" ? `-${weatherSubTab}` : "") + (activeTab === "currency" ? `-${currencySubTab}` : "")}
              className="absolute inset-0"
              style={{ animation: "cenario-page-enter 0.5s cubic-bezier(0.16,1,0.3,1) both" }}
            >

            {/* ═══ HOME ═══ */}
            {activeTab === "home" && (() => {
              const textColor = (config.home.bgImage || config.home.bgGradient) ? "#fff" : "#333";
              // Program progress bar
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
              return (
                <div className="absolute inset-0 flex flex-col" style={{ padding: "2.5vh 3vh", color: textColor }}>
                  {/* Top-left: small clock + date */}
                  <div style={{ animation: "cenario-clock-enter 0.6s cubic-bezier(0.16,1,0.3,1) both" }}>
                    <div className="flex items-center gap-[0.8vh]">
                      <Clock style={{ width: "2vh", height: "2vh", opacity: 0.7 }} />
                      <span className="font-bold" style={{ fontSize: "2.8vh", fontVariantNumeric: "tabular-nums", letterSpacing: "-0.02em" }}>
                        {currentTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                      </span>
                    </div>
                    <div className="opacity-70" style={{ fontSize: "1.4vh", marginTop: "0.3vh", marginLeft: "2.8vh" }}>
                      {currentTime.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </div>
                  </div>

                  {/* Center: Program logo + info */}
                  <div className="flex-1 flex flex-col items-center justify-center" style={{ gap: "1.5vh" }}>
                    {currentProgram?.selo && (
                      <img
                        src={currentProgram.selo}
                        alt={currentProgram.nome}
                        className="object-contain drop-shadow-lg"
                        style={{ maxWidth: "35vh", maxHeight: "22vh", animation: "cenario-fade-in 0.8s cubic-bezier(0.16,1,0.3,1) 0.2s both" }}
                      />
                    )}
                    {currentProgram && (
                      <div className="text-center" style={{ animation: "cenario-slide-up 0.6s cubic-bezier(0.16,1,0.3,1) 0.3s both" }}>
                        {!currentProgram.selo && (
                          <div className="font-bold drop-shadow-md" style={{ fontSize: "3vh", marginBottom: "0.5vh" }}>{currentProgram.nome}</div>
                        )}
                        <div className="opacity-70 font-medium" style={{ fontSize: "1.6vh" }}>
                          {currentProgram.horario_inicio} — {currentProgram.horario_fim}
                        </div>
                        {/* Progress bar */}
                        <div className="mx-auto" style={{ width: "25vh", height: "0.5vh", marginTop: "1vh", borderRadius: "1vh", background: "rgba(255,255,255,0.2)", overflow: "hidden" }}>
                          <div style={{ width: `${progressPct}%`, height: "100%", borderRadius: "1vh", background: "#e1f532", transition: "width 1s linear", boxShadow: "0 0 8px rgba(225,245,50,0.5)" }} />
                        </div>
                      </div>
                    )}
                    {!currentProgram && (
                      <div className="opacity-40 text-center" style={{ fontSize: "1.8vh" }}>Nenhum programa no ar</div>
                    )}
                  </div>

                  {/* Bottom: Music cover */}
                  {musicData && (
                    <div
                      key={musicKey}
                      className="flex items-center gap-[1.5vh] self-center"
                      style={{
                        padding: "1vh 1.5vh",
                        borderRadius: "1.2vh",
                        background: "rgba(0,0,0,0.4)",
                        WebkitBackdropFilter: "blur(12px)",
                        backdropFilter: "blur(12px)",
                        border: "1px solid rgba(255,255,255,0.1)",
                        maxWidth: "80%",
                        animation: "cenario-cover-in 0.6s cubic-bezier(0.16,1,0.3,1) both",
                      }}
                    >
                      {musicData.capa ? (
                        <img src={musicData.capa} alt="" className="rounded-lg object-cover" style={{ width: "6vh", height: "6vh", flexShrink: 0 }} />
                      ) : (
                        <div className="rounded-lg flex items-center justify-center" style={{ width: "6vh", height: "6vh", flexShrink: 0, background: "rgba(255,255,255,0.1)" }}>
                          <Music style={{ width: "2.5vh", height: "2.5vh", opacity: 0.5 }} />
                        </div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <div className="font-bold truncate" style={{ fontSize: "1.6vh", color: "#fff" }}>{musicData.titulo}</div>
                        <div className="truncate opacity-70" style={{ fontSize: "1.3vh", color: "#fff" }}>{musicData.artista}</div>
                      </div>
                    </div>
                  )}

                  {/* Sponsor logos */}
                  {sponsorLogos.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-2" style={{ marginTop: "1.5vh", animation: "cenario-slide-up 0.5s cubic-bezier(0.16,1,0.3,1) 0.5s both" }}>
                      {sponsorLogos.map(l => l.logo_url && <img key={l.id} src={l.logo_url} alt={l.nome} className="object-contain rounded drop-shadow-md" style={{ width: "4vh", height: "4vh", background: "rgba(255,255,255,0.15)", padding: 2 }} />)}
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
                <div className="relative z-10 flex flex-col h-full" style={{ padding: "3vh" }}>
                  {liveWeather ? (<>
                    {weatherSubTab === "today" && (<>
                      <div className="flex items-start justify-between" style={{ marginBottom: "1.5vh" }}>
                        <div>
                          <div className="font-black leading-none drop-shadow-lg" style={{ fontSize: "4.5vh", letterSpacing: "-0.02em" }}>{weatherCity || config.city || "Cidade"}</div>
                          <div className="font-bold uppercase tracking-widest" style={{ fontSize: "1.8vh", color: "#e1f532", marginTop: "0.5vh" }}>hoje</div>
                        </div>
                        <div style={{ width: "8vh", height: "8vh" }}>
                          <WeatherIcon code={liveWeather.current.code} size={64} />
                        </div>
                      </div>
                      <div className="flex-1 rounded-2xl flex flex-col" style={{ padding: "2.5vh", gap: "2vh", background: "rgba(255,255,255,0.12)", WebkitBackdropFilter: "blur(20px)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.2)", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
                        <div className="flex items-center gap-3" style={{ gap: "2vh" }}>
                          <div className="drop-shadow-xl" style={{ width: "14vh", height: "14vh", filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.2))" }}>
                            <WeatherIcon code={liveWeather.current.code} size={112} forceDay />
                          </div>
                          <div className="flex flex-col">
                            <div className="font-black drop-shadow-lg" style={{ fontSize: "6vh", lineHeight: 1 }}>{liveWeather.current.temp}°</div>
                            <div className="font-medium opacity-90" style={{ fontSize: "1.6vh" }}>{getWLabel(liveWeather.current.code)}</div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between rounded-xl" style={{ padding: "1.5vh 2vh", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.1)" }}>
                          <div className="flex items-center" style={{ gap: "0.8vh" }}>
                            <Thermometer style={{ width: "2vh", height: "2vh", opacity: 0.8 }} />
                            <span className="font-bold" style={{ fontSize: "2vh" }}>{liveWeather.daily[0]?.min ?? "--"}° / {liveWeather.daily[0]?.max ?? "--"}°</span>
                          </div>
                          <div className="flex items-center" style={{ gap: "1.5vh", fontSize: "1.5vh" }}>
                            <span className="flex items-center" style={{ gap: "0.4vh" }}><Droplets style={{ width: "1.5vh", height: "1.5vh", opacity: 0.8 }} /> {liveWeather.current.humidity}%</span>
                            <span className="flex items-center" style={{ gap: "0.4vh" }}>🌧 {liveWeather.daily[0]?.precip ?? 0}%</span>
                          </div>
                        </div>
                      </div>
                    </>)}
                    {weatherSubTab === "forecast" && (<>
                      <div className="flex items-start justify-between" style={{ marginBottom: "2vh" }}>
                        <div>
                          <div className="font-black leading-none drop-shadow-lg" style={{ fontSize: "4.5vh", letterSpacing: "-0.02em" }}>{weatherCity || config.city || "Cidade"}</div>
                          <div className="font-bold uppercase tracking-widest" style={{ fontSize: "1.8vh", color: "#e1f532", marginTop: "0.5vh" }}>próximos dias</div>
                        </div>
                        <CalendarDays style={{ width: "5vh", height: "5vh", opacity: 0.8 }} />
                      </div>
                      <div className="flex-1 rounded-2xl flex flex-col" style={{ padding: "2vh", gap: "1.5vh", background: "rgba(255,255,255,0.12)", WebkitBackdropFilter: "blur(20px)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.2)", boxShadow: "0 8px 32px rgba(0,0,0,0.15)" }}>
                        {liveWeather.daily.slice(1, 4).map((d, i) => (
                          <div key={i} className="flex items-center justify-between rounded-xl" style={{ fontSize: "1.8vh", padding: "1.5vh 2vh", background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.08)" }}>
                            <span className="font-bold" style={{ width: "30%" }}>{new Date(d.date + "T12:00").toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" })}</span>
                            <div style={{ width: "4vh", height: "4vh" }}><WeatherIcon code={d.code} size={32} forceDay /></div>
                            <span className="font-semibold" style={{ width: "30%", textAlign: "right" }}>↓{d.min}° ↑{d.max}°</span>
                          </div>
                        ))}
                      </div>
                    </>)}
                    {weatherSubTab === "satellite" && null}
                  </>) : (
                    <div className="flex-1 flex items-center justify-center opacity-50" style={{ fontSize: "1.8vh" }}>
                      <CloudSun size={24} className="mr-1" /> {weatherCity ? "Carregando..." : "Configure uma cidade"}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ═══ TRAFFIC ═══ */}
            {activeTab === "traffic" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ padding: "3vh" }}>
                {config.traffic.enabled && trafficCoords ? null : (
                  <div className="opacity-50" style={{ color: "#333", fontSize: "1.8vh" }}>Trânsito desativado</div>
                )}
              </div>
            )}

            {/* ═══ CURRENCY ═══ */}
            {activeTab === "currency" && (
              <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ color: "#fff" }}>
                {config.currency.bgImage && <div className="absolute inset-0" style={{ background: "rgba(3,8,14,0.3)" }} />}
                <div className="relative z-10 flex flex-col h-full" style={{ padding: "3vh" }}>
                    {config.currency.enabled ? (<>
                    <div className="flex justify-end mb-1 cenario-anim-icon"><DollarSign size={48} className="drop-shadow-lg" style={{ color: "#e1f532" }} /></div>
                    <div style={{ marginBottom: "1.6vh" }}>
                      <div className="font-extrabold leading-tight drop-shadow-lg cenario-anim-title" style={{ fontSize: "4.2vh" }}>cotação</div>
                      <div className="font-bold cenario-anim-subtitle" style={{ fontSize: "2.6vh", color: "#e1f532" }}>
                        {currencySubTab === "moedas" ? "moedas" : "bolsas"}
                      </div>
                    </div>

                    {currencySubTab === "moedas" ? (
                      <div className="flex-1 flex flex-col overflow-auto" style={{ gap: "0.6vh" }}>
                        {config.currency.currencies.map((c, idx) => {
                          const opt = CURRENCY_OPTIONS.find(o => o.value === c);
                          const live = liveCurrencies.find(l => l.code === c);
                          const flagIcon = opt?.flag ? COUNTRY_FLAG_MAP[opt.flag] : "";
                          return (
                            <div key={c} className={`flex items-center cenario-anim-row-${Math.min(idx + 1, 8)}`} style={{ padding: "1.2vh 1.5vh", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                              <div className="flex items-center" style={{ gap: "1.2vh", flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: "3vh", opacity: 0.2, filter: "grayscale(1) brightness(10)", lineHeight: 1 }}>{flagIcon}</span>
                                <div className="flex flex-col" style={{ minWidth: 0 }}>
                                  <span className="font-bold truncate" style={{ fontSize: "2vh", lineHeight: 1.2 }}>{c}</span>
                                  <span className="truncate" style={{ fontSize: "1.3vh", opacity: 0.5, lineHeight: 1.2 }}>{opt?.label?.split("(")[0]?.trim()}</span>
                                </div>
                              </div>
                              {live ? (
                                <div className="flex items-center" style={{ gap: "1vh", flexShrink: 0 }}>
                                  <span className="font-black tabular-nums" style={{ fontSize: "2.2vh" }}>{live.value}</span>
                                  <div className="flex items-center" style={{ gap: "0.3vh" }}>
                                    <span className="font-bold tabular-nums" style={{ fontSize: "1.6vh", color: live.direction === "up" ? "#4ade80" : live.direction === "down" ? "#f87171" : "rgba(255,255,255,0.5)" }}>{live.change}</span>
                                    {live.direction === "up" && <ChevronUp style={{ width: "2vh", height: "2vh" }} strokeWidth={3} className="cenario-arrow-up" />}
                                    {live.direction === "down" && <ChevronDown style={{ width: "2vh", height: "2vh" }} strokeWidth={3} className="cenario-arrow-down" />}
                                  </div>
                                </div>
                              ) : <span className="opacity-30">---</span>}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col overflow-auto" style={{ gap: "0.6vh" }}>
                        {liveStocks.map((s, idx) => {
                          const flagChar = COUNTRY_FLAG_MAP[s.flag?.replace(/[^A-Z]/g, "").slice(0,2)] || s.flag;
                          return (
                            <div key={s.symbol} className={`flex items-center cenario-anim-row-${Math.min(idx + 1, 8)}`} style={{ padding: "1.2vh 1.5vh", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                              <div className="flex items-center" style={{ gap: "1.2vh", flex: 1, minWidth: 0 }}>
                                <span style={{ fontSize: "3vh", opacity: 0.2, filter: "grayscale(1) brightness(10)", lineHeight: 1 }}>{flagChar}</span>
                                <span className="font-bold truncate" style={{ fontSize: "2vh" }}>{s.name}</span>
                              </div>
                              <div className="flex items-center" style={{ gap: "1vh", flexShrink: 0 }}>
                                <span className="font-black tabular-nums" style={{ fontSize: "2.2vh" }}>{s.value}</span>
                                <div className="flex items-center" style={{ gap: "0.3vh" }}>
                                  <span className="font-bold tabular-nums" style={{ fontSize: "1.6vh", color: s.direction === "up" ? "#4ade80" : s.direction === "down" ? "#f87171" : "rgba(255,255,255,0.5)" }}>{s.change}</span>
                                  {s.direction === "up" && <ChevronUp style={{ width: "2vh", height: "2vh" }} strokeWidth={3} className="cenario-arrow-up" />}
                                  {s.direction === "down" && <ChevronDown style={{ width: "2vh", height: "2vh" }} strokeWidth={3} className="cenario-arrow-down" />}</div>
                              </div>
                            </div>
                          );
                        })}
                        {!liveStocks.length && (
                          <div className="opacity-60 text-center" style={{ fontSize: "1.8vh" }}>Dados indisponíveis</div>
                        )}
                      </div>
                    )}
                  </>) : (
                    <div className="flex-1 flex items-center justify-center opacity-70" style={{ fontSize: "1.9vh" }}>Cotação desativada</div>
                  )}
                </div>
              </div>
            )}

            {/* ═══ CHAT ═══ */}
            {activeTab === "chat" && (
              <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ color: "#fff" }}>
                {!config.chat.bgImage && <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 100%)" }} />}
                <div className="absolute bottom-0 left-0 right-0 h-1/4" style={{ background: "linear-gradient(to top, rgba(200,230,0,0.25), transparent)" }} />
                <div className="relative z-10 flex flex-col h-full" style={{ padding: "3vh" }}>
                  {config.chat.enabled ? (<>
                    <div className="flex justify-end mb-1"><MessageCircle size={48} className="drop-shadow-lg" style={{ color: "#e1f532" }} /></div>
                    <div style={{ marginBottom: "2vh" }}>
                      <div className="font-extrabold leading-tight drop-shadow-lg" style={{ fontSize: "4vh" }}>mensagens</div>
                      <div className="font-bold" style={{ fontSize: "2.5vh", color: "#e1f532" }}>chat</div>
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
                          <div className="flex-1 flex items-center justify-center opacity-50 h-full" style={{ fontSize: "1.8vh" }}>
                            Insira a URL da live para carregar o chat
                          </div>
                        );
                      })()}
                    </div>
                  </>) : (
                    <div className="flex-1 flex items-center justify-center opacity-50" style={{ fontSize: "1.8vh" }}>Chat desativado</div>
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

          {/* Realtime connection indicator */}
          <div className="absolute bottom-2 right-2 flex items-center gap-1 px-2 py-1 rounded-full" style={{ background: "rgba(0,0,0,0.6)", WebkitBackdropFilter: "blur(8px)", backdropFilter: "blur(8px)", zIndex: 50, fontSize: "1vh" }}>
            <div className="rounded-full" style={{ width: "0.8vh", height: "0.8vh", background: realtimeConnected ? "#4ade80" : "#ef4444", boxShadow: realtimeConnected ? "0 0 6px #4ade80" : "0 0 6px #ef4444", animation: realtimeConnected ? "cenario-active-blink 2s ease-in-out infinite" : "none" }} />
            <span className="text-white/60 font-medium" style={{ fontSize: "0.9vh" }}>
              {realtimeConnected ? "SYNC" : "OFF"}
            </span>
            {lastSyncTime && realtimeConnected && (
              <span className="text-white/30" style={{ fontSize: "0.8vh" }}>
                {lastSyncTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </span>
            )}
          </div>

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

          </div>
        </div>
      </div>
    </div>
  );
}
