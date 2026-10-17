import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { MonitorPlay, CloudSun, CloudRain, Car, DollarSign, MessageCircle, Trash2, Eye, EyeOff, Settings, Home, MapPin, Satellite, Sun, CalendarDays, Search, Upload, Image, Clock, Loader2, Droplets, Wind, Thermometer, ExternalLink, TrendingUp, TrendingDown, Minus, Plus, ChevronUp, ChevronDown, Pen, Eraser, Wifi, WifiOff, RefreshCw, Palette, Undo2, Shapes, Square, Circle, Triangle, ArrowUp, ArrowRight, ArrowDown, ArrowLeft, Star, Hexagon, Diamond, Music, Mic, RotateCw, Play, Maximize2, Tag, Smartphone, Monitor, Copy } from "lucide-react";
import { WeatherIcon } from "@/components/WeatherIcons";
import DraggableElement, { ElementPosition, defaultPositions } from "@/components/cenario/DraggableElement";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { GradientPicker } from "@/components/ui/GradientPicker";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import TrafficMap from "@/components/TrafficMap";
import SatelliteMap from "@/components/SatelliteMap";
import CenarioQuotesPanel from "@/components/cenario/CenarioQuotesPanel";
import { findClientAccountById, findClientAccountByEmail } from "@/lib/clientAuthAccounts";
import { getClientHouseMixProgramsSync } from "@/lib/houseMixProgramasService";

/* ─── types ─── */
interface WeatherConfig {
  enabled: boolean;
  showCurrent: boolean;
  showForecast3Days: boolean;
  showSatellite: boolean;
  city: string;
  favorites?: { name: string; lat: number; lon: number }[];
  bgImage: string;
  lat?: number | null;
  lon?: number | null;
  zoom?: number;
}

interface TrafficPoint {
  id: string;
  label: string;
  lat: number;
  lng: number;
}

interface TrafficConfig {
  enabled: boolean;
  city: string;
  points: TrafficPoint[];
  favorites?: TrafficPoint[];
  bgImage: string;
  lat: number | null;
  lon: number | null;
  zoom: number;
}

interface CurrencyConfig {
  enabled: boolean;
  currencies: string[];
  bgImage: string;
}

interface ChatConfig {
  enabled: boolean;
  youtubeVideoUrl: string;
  bgImage: string;
}

interface HomeConfig {
  bgImage: string;
  bgGradient?: boolean;
  bgGradientColorA?: string;
  bgGradientColorB?: string;
  bgGradientType?: "linear" | "radial";
  bgGradientAngle?: number;
  exceptionWords?: string;
  elementPositions?: Record<string, ElementPosition>;
  showArtistImage?: boolean;
  artistOverlayEnabled?: boolean;
  artistOverlayColor?: string;
  artistOverlayOpacity?: number;
  showMusicCover?: boolean;
  showProgramThumb?: boolean;
  colorButtonBgOff?: string;
  colorButtonBgOn?: string;
  colorButtonOff?: string;
  colorButtonOn?: string;
  colorClock?: string;
  colorDate?: string;
  colorMusicName?: string;
  colorMusicTitle?: string;
  colorASeguirLabel?: string;
  colorNextProgram?: string;
  colorProgressBar?: string;

}

interface CenarioConfig {
  city: string;
  useProgramThumbAsBg?: boolean;
  programThumbPosition?: string;
  thumbOverlayEnabled?: boolean;
  thumbOverlayColor?: string;
  thumbOverlayOpacity?: number;
  bgAlternateMode?: boolean;
  bgType?: "static" | "gradient" | "thumb" | "none";
  home: HomeConfig;
  weather: WeatherConfig;
  traffic: TrafficConfig;
  currency: CurrencyConfig;
  chat: ChatConfig;
  enquete: { enabled: boolean; bgImage: string };
}

function buildHomeGradient(h: HomeConfig): string {
  const a = h.bgGradientColorA || "#1a1a2e";
  const b = h.bgGradientColorB || "#16213e";
  const type = h.bgGradientType || "linear";
  const angle = h.bgGradientAngle ?? 135;
  return type === "radial" ? `radial-gradient(circle, ${a}, ${b})` : `linear-gradient(${angle}deg, ${a}, ${b})`;
}

const defaultConfig: CenarioConfig = {
  city: "",
  useProgramThumbAsBg: false,
  programThumbPosition: "center",
  bgType: "none",
  home: {
    bgImage: "",
    showArtistImage: true,
    showMusicCover: true,
    showProgramThumb: true,
    colorButtonBgOff: "rgba(0,0,0,0.8)",
    colorButtonBgOn: "rgba(0,191,240,0.85)",
    colorButtonOff: "rgba(255,255,255,0.7)",
    colorButtonOn: "#FFFFFF",
  },

  weather: { enabled: true, showCurrent: true, showForecast3Days: true, showSatellite: false, city: "", bgImage: "", lat: null, lon: null, zoom: 6, favorites: [] },
  traffic: { enabled: false, city: "", points: [], bgImage: "", lat: null, lon: null, zoom: 13 },
  currency: { enabled: true, currencies: ["USD", "EUR"], bgImage: "" },
  chat: { enabled: false, youtubeVideoUrl: "", bgImage: "" },
  enquete: { enabled: true, bgImage: "" },
};

const CURRENCY_OPTIONS = [
  { value: "USD", label: "Dólar Comercial (USD)", flag: "US" },
  { value: "EUR", label: "Euro (EUR)", flag: "EU" },
  { value: "GBP", label: "Libra Esterlina (GBP)", flag: "GB" },
  { value: "ARS", label: "Peso Argentino (ARS)", flag: "AR" },
  { value: "JPY", label: "Iene Japonês (JPY)", flag: "JP" },
  { value: "BTC", label: "Bitcoin (BTC)", flag: "BT" },
  { value: "ETH", label: "Ethereum (ETH)", flag: "ET" },
];

const weatherIcons: Record<number, string> = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️", 45: "🌫️", 48: "🌫️",
  51: "🌦️", 53: "🌦️", 55: "🌧️", 61: "🌧️", 63: "🌧️", 65: "🌧️",
  71: "🌨️", 73: "🌨️", 75: "🌨️", 80: "🌧️", 81: "🌧️", 82: "🌧️",
  95: "⛈️", 96: "⛈️", 99: "⛈️",
};
const weatherLabels: Record<number, string> = {
  0: "Céu limpo", 1: "Parcialmente limpo", 2: "Parcialmente nublado", 3: "Nublado",
  45: "Neblina", 48: "Neblina", 51: "Garoa leve", 53: "Garoa", 55: "Garoa forte",
  61: "Chuva leve", 63: "Chuva moderada", 65: "Chuva forte",
  71: "Neve leve", 73: "Neve", 75: "Neve forte",
  80: "Pancadas leves", 81: "Pancadas", 82: "Pancadas fortes",
  95: "Tempestade", 96: "Tempestade com granizo", 99: "Tempestade severa",
};
function getWIcon(code: number) { return weatherIcons[code] ?? weatherIcons[Object.keys(weatherIcons).map(Number).reduce((a, b) => Math.abs(b - code) < Math.abs(a - code) ? b : a)] ?? "🌡️"; }
function getWLabel(code: number) { return weatherLabels[code] ?? weatherLabels[Object.keys(weatherLabels).map(Number).reduce((a, b) => Math.abs(b - code) < Math.abs(a - code) ? b : a)] ?? ""; }

interface LiveWeather {
  current: { temp: number; humidity: number; code: number };
  daily: { date: string; min: number; max: number; code: number; humidity: number; precip: number; rainMm?: number; windMax?: number }[];
}

/* ─── Currency API mapping ─── */
const CURRENCY_API_MAP: Record<string, string> = {
  USD: "USD-BRL", EUR: "EUR-BRL", GBP: "GBP-BRL", ARS: "ARS-BRL", JPY: "JPY-BRL", BTC: "BTC-BRL", ETH: "ETH-BRL",
};

interface LiveCurrency {
  code: string;
  name: string;
  value: string;
  change: string;
  direction: "up" | "down" | "neutral";
}

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
        code: c,
        name: opt?.label?.split("(")[0]?.trim() || item.name,
        value: parseFloat(item.bid).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 }),
        change: `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`,
        direction: pct > 0 ? "up" as const : pct < 0 ? "down" as const : "neutral" as const,
      };
    }).filter(Boolean) as LiveCurrency[];
  } catch {
    return [];
  }
}

/* ─── Stock Exchange (Bolsas) ─── */
const STOCK_EXCHANGES = [
  { symbol: "^BVSP", name: "Ibovespa", flag: "🇧🇷" },
  { symbol: "^GSPC", name: "S&P 500", flag: "🇺🇸" },
  { symbol: "^DJI", name: "Dow Jones", flag: "🇺🇸" },
  { symbol: "^IXIC", name: "Nasdaq", flag: "🇺🇸" },
  { symbol: "^FTSE", name: "FTSE 100", flag: "🇬🇧" },
  { symbol: "^N225", name: "Nikkei 225", flag: "🇯🇵" },
  { symbol: "^GDAXI", name: "DAX", flag: "🇩🇪" },
];

interface LiveStock {
  symbol: string;
  name: string;
  flag: string;
  value: string;
  change: string;
  direction: "up" | "down" | "neutral";
}

async function fetchLiveStocks(): Promise<LiveStock[]> {
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const res = await fetch(`${supabaseUrl}/functions/v1/fetch-stocks`, {
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error("fetch-stocks failed");
    const data = await res.json();
    return (data.stocks || []) as LiveStock[];
  } catch {
    return [];
  }
}

const mockMessages: { user: string; text: string; avatar?: string }[] = [];

/* ─── BG Upload helper ─── */
async function uploadBgImage(file: File, userId: string, category: string): Promise<string> {
  const ext = file.name.split(".").pop() || "jpg";
  const path = `cenario/${userId}/${category}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from("empresa-assets").upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from("empresa-assets").getPublicUrl(path);
  return data.publicUrl;
}

function BgImageUpload({ value, onChange, mutedText, userId, category }: { value: string; onChange: (v: string) => void; mutedText: string; userId?: string; category: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Imagem deve ter no máximo 5MB"); return; }
    if (!userId) { toast.error("Faça login para enviar imagens"); return; }
    setUploading(true);
    try {
      const url = await uploadBgImage(file, userId, category);
      onChange(url);
      toast.success("Imagem enviada!");
    } catch (err) {
      toast.error("Erro ao enviar imagem");
    } finally {
      setUploading(false);
    }
  };
  return (
    <div className="space-y-2">
      <Label className="text-xs flex items-center gap-1" style={{ color: mutedText }}>
        <Image size={12} /> Imagem de fundo
      </Label>
      {value ? (
        <div className="relative rounded-lg overflow-hidden border" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333) 20%, transparent)" }}>
          <img src={value} alt="Fundo" className="w-full h-24 object-cover" />
          <button
            onClick={() => onChange("")}
            className="absolute top-1 right-1 rounded-full p-1"
            style={{ background: "rgba(0,0,0,0.6)" }}
          >
            <Trash2 size={12} className="text-white" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="w-full rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-1 py-4 text-xs transition-colors hover:opacity-80"
          style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333) 30%, transparent)", color: mutedText }}
        >
          <Upload size={16} />
          <span>{uploading ? "Enviando..." : "Clique para enviar imagem"}</span>
          <span className="text-[10px]">PNG, JPG (máx. 5MB)</span>
        </button>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
    </div>
  );
}

/* ── Exception words input with manual save ── */
function ExceptionWordsInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [local, setLocal] = useState(value);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setLocal(value);
    setDirty(false);
  }, [value]);

  const handleSave = () => {
    onSave(local);
    setDirty(false);
  };

  return (
    <div className="space-y-2">
      <Input
        value={local}
        onChange={e => {
          setLocal(e.target.value);
          setDirty(true);
        }}
        placeholder="break, vinheta, hora certa"
        className="h-7 text-xs"
      />
      <Button variant="save"
        type="button"
        size="sm"
        onClick={handleSave}
        disabled={!dirty}
        className="h-7 px-3 text-xs bg-[var(--layout-accent-color)] hover:bg-[var(--layout-accent-color)]/90 text-white"
        style={{ backgroundColor: 'var(--layout-accent-color)' }}
      >
        Salvar
      </Button>
    </div>
  );
}

/* ─── COMPONENT ─── */
/* eslint-disable @typescript-eslint/no-unused-vars */
const VALID_SCENE_TABS = new Set(["home", "weather", "traffic", "currency", "chat", "enquete"]);
const normalizeSceneTab = (tab: unknown, fallback = "home") =>
  typeof tab === "string" && VALID_SCENE_TABS.has(tab) ? tab : fallback;

export default function CenarioInterativoPage({ effectiveUserId }: { effectiveUserId?: string | null } = {}) {
  const { user } = useAuth();
  const targetUserId = effectiveUserId || user?.id;
  const [config, setConfig] = useState<CenarioConfig>(defaultConfig);
  // activeTab é exclusivamente a cena que vai ao ar; settingsTab controla apenas a navegação do editor.
  const [activeTab, setActiveTab] = useState("home");
  const [settingsTab, setSettingsTab] = useState("home");
  const [chatMessages, setChatMessages] = useState<{ user: string; text: string; avatar?: string }[]>([]);
  const [isUpdatingChat, setIsUpdatingChat] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    cenario1: true,
    cenario2: true,
    visibilityCovers: false,
    cores: true
  });
  const [weatherSubTab, setWeatherSubTab] = useState("today");
  
  const [enquetes, setEnquetes] = useState<any[]>([]);
  
  // Sincroniza a exibição do satélite com a opção de configuração
  useEffect(() => {
    if (weatherSubTab === "satellite" && !config.weather.showSatellite) {
      setWeatherSubTab("today");
    }
  }, [config.weather.showSatellite, weatherSubTab]);
  const [currencySubTab, setCurrencySubTab] = useState<"moedas" | "bolsas">("moedas");
  // satellite zoom is now in config.weather.zoom
  const isRemoteUpdateRef = useRef(false);

  /* ─── Preview Drawing ─── */
  const [previewDrawActive, setPreviewDrawActive] = useState(false);
  const [previewHasDrawing, setPreviewHasDrawing] = useState(false);
  const [previewDrawColor, setPreviewDrawColor] = useState("#ff3b3b");
  const [previewDrawWidth, setPreviewDrawWidth] = useState(3);
  const [showPreviewDrawOptions, setShowPreviewDrawOptions] = useState(false);
  const [previewDrawMode, setPreviewDrawMode] = useState<"pen" | "eraser" | "shape">("pen");
  const [showShapesPanel, setShowShapesPanel] = useState(false);
  const [selectedShape, setSelectedShape] = useState<string | null>(null);
  const [shapeStartPos, setShapeStartPos] = useState<{ px: number; py: number } | null>(null);
  const drawHistoryRef = useRef<ImageData[]>([]);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const homeContentRef = useRef<HTMLDivElement>(null);
  const previewIsDrawingRef = useRef(false);
  const previewWrapRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState(0.278);
  // previewZoom removed — preview now auto-fits the container at 100%.
  const PREV_W = 1080;
  const PREV_H = 1920;
  const pvh = useCallback((v: number) => v * PREV_H / 100, []);
  const PREV_DRAW_COLORS = ["#ff3b3b", "#ff3b3b", "#3b82f6", "#4ade80", "#f59e0b", "#ffffff"];
  const PREV_DRAW_WIDTHS = [2, 4, 8, 14];
  const SHAPE_OPTIONS = [
    { id: "arrow-up", icon: ArrowUp, label: "Seta ↑" },
    { id: "arrow-right", icon: ArrowRight, label: "Seta →" },
    { id: "arrow-down", icon: ArrowDown, label: "Seta ↓" },
    { id: "arrow-left", icon: ArrowLeft, label: "Seta ←" },
    { id: "square", icon: Square, label: "Quadrado" },
    { id: "circle", icon: Circle, label: "Círculo" },
    { id: "triangle", icon: Triangle, label: "Triângulo" },
    { id: "star", icon: Star, label: "Estrela" },
    { id: "diamond", icon: Diamond, label: "Losango" },
  ];

  const getPreviewCanvasPos = useCallback((e: React.MouseEvent | React.TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return { x: clientX - rect.left, y: clientY - rect.top, px: (clientX - rect.left) / rect.width, py: (clientY - rect.top) / rect.height };
  }, []);

  const saveCanvasState = useCallback(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    drawHistoryRef.current.push(imgData);
    if (drawHistoryRef.current.length > 50) drawHistoryRef.current.shift();
  }, []);

  const undoLastDraw = useCallback(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    if (drawHistoryRef.current.length > 0) {
      const prev = drawHistoryRef.current.pop()!;
      ctx.putImageData(prev, 0, 0);
      setPreviewHasDrawing(drawHistoryRef.current.length > 0);
      sendDrawClear();
      // Re-broadcast full canvas state isn't simple, so just clear remote & note limitation
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setPreviewHasDrawing(false);
      sendDrawClear();
    }
  }, []);

  const drawShapeOnCanvas = useCallback((canvas: HTMLCanvasElement, shape: string, startPx: number, startPy: number, endPx: number, endPy: number, color: string, width: number) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const sx = startPx * canvas.width, sy = startPy * canvas.height;
    const ex = endPx * canvas.width, ey = endPy * canvas.height;
    const w = ex - sx, h = ey - sy;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    switch (shape) {
      case "square":
        ctx.rect(sx, sy, w, h);
        break;
      case "circle": {
        const rx = Math.abs(w) / 2, ry = Math.abs(h) / 2;
        const cx = sx + w / 2, cy = sy + h / 2;
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        break;
      }
      case "triangle":
        ctx.moveTo(sx + w / 2, sy);
        ctx.lineTo(sx + w, sy + h);
        ctx.lineTo(sx, sy + h);
        ctx.closePath();
        break;
      case "diamond":
        ctx.moveTo(sx + w / 2, sy);
        ctx.lineTo(sx + w, sy + h / 2);
        ctx.lineTo(sx + w / 2, sy + h);
        ctx.lineTo(sx, sy + h / 2);
        ctx.closePath();
        break;
      case "star": {
        const cx = sx + w / 2, cy = sy + h / 2;
        const outerR = Math.min(Math.abs(w), Math.abs(h)) / 2;
        const innerR = outerR * 0.4;
        for (let i = 0; i < 10; i++) {
          const r = i % 2 === 0 ? outerR : innerR;
          const angle = (Math.PI / 5) * i - Math.PI / 2;
          const px = cx + r * Math.cos(angle);
          const py = cy + r * Math.sin(angle);
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        break;
      }
      case "arrow-up": {
        const cx = sx + w / 2;
        ctx.moveTo(cx, sy); ctx.lineTo(sx + w, sy + h * 0.4);
        ctx.moveTo(cx, sy); ctx.lineTo(sx, sy + h * 0.4);
        ctx.moveTo(cx, sy); ctx.lineTo(cx, sy + h);
        break;
      }
      case "arrow-right": {
        const cy = sy + h / 2;
        ctx.moveTo(sx + w, cy); ctx.lineTo(sx + w * 0.6, sy);
        ctx.moveTo(sx + w, cy); ctx.lineTo(sx + w * 0.6, sy + h);
        ctx.moveTo(sx + w, cy); ctx.lineTo(sx, cy);
        break;
      }
      case "arrow-down": {
        const cx = sx + w / 2;
        ctx.moveTo(cx, sy + h); ctx.lineTo(sx + w, sy + h * 0.6);
        ctx.moveTo(cx, sy + h); ctx.lineTo(sx, sy + h * 0.6);
        ctx.moveTo(cx, sy + h); ctx.lineTo(cx, sy);
        break;
      }
      case "arrow-left": {
        const cy = sy + h / 2;
        ctx.moveTo(sx, cy); ctx.lineTo(sx + w * 0.4, sy);
        ctx.moveTo(sx, cy); ctx.lineTo(sx + w * 0.4, sy + h);
        ctx.moveTo(sx, cy); ctx.lineTo(sx + w, cy);
        break;
      }
    }
    ctx.stroke();
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

  /* ─── Supabase Realtime draw channel (cross-device) ─── */
  const rtDrawChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel(`draw-sync-${user.id}`);
    ch.on("broadcast", { event: "draw" }, ({ payload }: any) => {
      const canvas = previewCanvasRef.current;
      if (canvas && payload) {
        drawOnCanvas(canvas, payload.action, payload.px, payload.py, payload.color, payload.width);
        if (payload.action === "move") setPreviewHasDrawing(true);
      }
    }).on("broadcast", { event: "draw-clear" }, () => {
      const canvas = previewCanvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        setPreviewHasDrawing(false);
      }
    }).on("broadcast", { event: "draw-shape" }, ({ payload }: any) => {
      const canvas = previewCanvasRef.current;
      if (canvas && payload) {
        drawShapeOnCanvas(canvas, payload.shape, payload.startPx, payload.startPy, payload.endPx, payload.endPy, payload.color, payload.width);
        setPreviewHasDrawing(true);
      }
    }).on("broadcast", { event: "zoom-change" }, ({ payload }: any) => {
      if (payload && typeof payload.zoom === "number") updateWeather({ zoom: payload.zoom });
    }).on("broadcast", { event: "config-update" }, ({ payload }: any) => {
    if (payload?.config && typeof payload.config === "object") {
      isRemoteUpdateRef.current = true;
      
      // Clear chat if youtubeVideoUrl changed
      if (payload.config.chat?.youtubeVideoUrl && payload.config.chat.youtubeVideoUrl !== configRef.current.chat.youtubeVideoUrl) {
        setChatMessages([]);
      }
      
      // Prevent infinite loop by checking if the tab actually changed
        if (payload.config._activeTab) {
          const incomingScene = normalizeSceneTab(payload.config._activeTab, activeTabRef.current);
          if (incomingScene !== activeTabRef.current) setActiveTab(incomingScene);
        }
        
        if (payload.config._weatherSubTab && payload.config._weatherSubTab !== weatherSubTabRef.current) {
          setWeatherSubTab(payload.config._weatherSubTab);
        }
        
        if (payload.config._currencySubTab && payload.config._currencySubTab !== currencySubTabRef.current) {
          setCurrencySubTab(payload.config._currencySubTab);
        }
        
        if (typeof payload.config._screenRotation === 'number' && payload.config._screenRotation !== externalRotation) {
          setExternalRotation(payload.config._screenRotation);
        }

        // Merge main config
        setConfig(prev => {
          // Deep check to see if config actually changed to avoid unnecessary re-renders
          const currentConfigStr = JSON.stringify(prev);
          const newConfigStr = JSON.stringify({ ...prev, ...(payload.config as Partial<CenarioConfig>) });
          if (currentConfigStr === newConfigStr) return prev;
          return { ...prev, ...(payload.config as Partial<CenarioConfig>) };
        });
      }
    }).subscribe();
    rtDrawChannelRef.current = ch;
    return () => { supabase.removeChannel(ch); rtDrawChannelRef.current = null; };
  }, [user?.id, drawOnCanvas]);

  const sendDraw = useCallback((action: string, px: number, py: number, color: string, width: number) => {
    const msg = { type: "draw" as const, action, px, py, color, width };
    cenarioBcRef.current?.postMessage(msg);
    rtDrawChannelRef.current?.send({ type: "broadcast", event: "draw", payload: { action, px, py, color, width } });
  }, []);

  const sendDrawClear = useCallback(() => {
    cenarioBcRef.current?.postMessage({ type: "draw-clear" });
    rtDrawChannelRef.current?.send({ type: "broadcast", event: "draw-clear", payload: {} });
  }, []);

  const handlePreviewDrawStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !previewDrawActive) return;
    e.preventDefault();
    saveCanvasState();
    previewIsDrawingRef.current = true;
    const pos = getPreviewCanvasPos(e, canvas);
    if (previewDrawMode === "shape" && selectedShape) {
      setShapeStartPos({ px: pos.px, py: pos.py });
      return;
    }
    if (previewDrawMode === "eraser") {
      const ctx = canvas.getContext("2d");
      if (ctx) { ctx.globalCompositeOperation = "destination-out"; }
    }
    drawOnCanvas(canvas, "start", pos.px, pos.py, previewDrawMode === "eraser" ? "rgba(0,0,0,1)" : previewDrawColor, previewDrawMode === "eraser" ? 20 : previewDrawWidth);
    sendDraw("start", pos.px, pos.py, previewDrawColor, previewDrawWidth);
  }, [previewDrawActive, previewDrawMode, selectedShape, getPreviewCanvasPos, previewDrawColor, previewDrawWidth, drawOnCanvas, sendDraw, saveCanvasState]);

  const handlePreviewDrawMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = previewCanvasRef.current;
    if (!canvas || !previewIsDrawingRef.current) return;
    e.preventDefault();
    if (previewDrawMode === "shape" && selectedShape && shapeStartPos) return; // shapes drawn on end
    const pos = getPreviewCanvasPos(e, canvas);
    if (previewDrawMode === "eraser") {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.globalCompositeOperation = "destination-out";
      drawOnCanvas(canvas, "move", pos.px, pos.py, "rgba(0,0,0,1)", 20);
    } else {
      drawOnCanvas(canvas, "move", pos.px, pos.py, previewDrawColor, previewDrawWidth);
    }
    setPreviewHasDrawing(true);
    sendDraw("move", pos.px, pos.py, previewDrawColor, previewDrawWidth);
  }, [getPreviewCanvasPos, previewDrawColor, previewDrawWidth, previewDrawMode, selectedShape, shapeStartPos, drawOnCanvas, sendDraw]);

  const handlePreviewDrawEnd = useCallback((e?: React.MouseEvent | React.TouchEvent) => {
    const canvas = previewCanvasRef.current;
    if (previewDrawMode === "shape" && selectedShape && shapeStartPos && canvas && e) {
      const pos = getPreviewCanvasPos(e, canvas);
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.globalCompositeOperation = "source-over";
      drawShapeOnCanvas(canvas, selectedShape, shapeStartPos.px, shapeStartPos.py, pos.px, pos.py, previewDrawColor, previewDrawWidth);
      setPreviewHasDrawing(true);
      setShapeStartPos(null);
      // broadcast shape
      cenarioBcRef.current?.postMessage({ type: "draw-shape", shape: selectedShape, startPx: shapeStartPos.px, startPy: shapeStartPos.py, endPx: pos.px, endPy: pos.py, color: previewDrawColor, width: previewDrawWidth });
      rtDrawChannelRef.current?.send({ type: "broadcast", event: "draw-shape", payload: { shape: selectedShape, startPx: shapeStartPos.px, startPy: shapeStartPos.py, endPx: pos.px, endPy: pos.py, color: previewDrawColor, width: previewDrawWidth } });
    }
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.globalCompositeOperation = "source-over";
    }
    previewIsDrawingRef.current = false;
    sendDraw("end", 0, 0, "", 0);
  }, [sendDraw, previewDrawMode, selectedShape, shapeStartPos, getPreviewCanvasPos, previewDrawColor, previewDrawWidth, drawShapeOnCanvas]);

  const clearPreviewDrawing = useCallback(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    setPreviewHasDrawing(false);
    sendDrawClear();
  }, [sendDrawClear]);

  const updateChatMessages = useCallback(async () => {
    if (!user?.id || activeTab !== "chat" || isUpdatingChat) return;
    setIsUpdatingChat(true);
    try {
      const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
      const now = new Date();
      const day = dayNames[now.getDay()];
      const time = now.toTimeString().slice(0, 5);
      const ytUrl = config.chat.youtubeVideoUrl;
      
      const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-cenario-data?uid=${user.id}&day=${encodeURIComponent(day)}&time=${time}${ytUrl ? `&ytUrl=${encodeURIComponent(ytUrl)}` : ""}&_t=${Date.now()}`;
      const resp = await fetch(baseUrl, {
        headers: { "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
      });
      
      if (resp.ok) {
        const result = await resp.json();
        if (result?.youtubeChatMessages && result.youtubeChatMessages.length > 0) {
          setChatMessages(prev => {
            const existingKeys = new Set(prev.map(m => `${m.user}:${m.text}`));
            const newOnes = result.youtubeChatMessages.filter((m: any) => !existingKeys.has(`${m.user}:${m.text}`));
            if (newOnes.length === 0) return prev;
            return [...prev, ...newOnes].slice(-50);
          });
        }
      }
    } catch (err) {
      console.error("Error updating chat in panel:", err);
    } finally {
      setIsUpdatingChat(false);
    }
  }, [user?.id, activeTab, isUpdatingChat, config.chat.youtubeVideoUrl]);

  useEffect(() => {
    if (activeTab === "chat") {
      updateChatMessages();
      const interval = setInterval(updateChatMessages, 15000);
      return () => clearInterval(interval);
    }
  }, [activeTab, updateChatMessages]);

  const fetchEnquetesData = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("enquetes_agendadas")
      .select("*")
      .eq("user_id", user.id)
      .order("data_enquete", { ascending: false });
    if (data) setEnquetes(data);
  }, [user?.id]);

  useEffect(() => {
    fetchEnquetesData();
    const interval = setInterval(fetchEnquetesData, 30000);
    return () => clearInterval(interval);
  }, [fetchEnquetesData]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const resize = () => { canvas.width = parent.clientWidth; canvas.height = parent.clientHeight; };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(parent);
    return () => ro.disconnect();
  }, []);

  const configRef = useRef(config);
  const activeTabRef = useRef(activeTab);
  const weatherSubTabRef = useRef(weatherSubTab);
  const currencySubTabRef = useRef(currencySubTab);
  useEffect(() => {
    configRef.current = config;
    // Push config to external screen instantly via BroadcastChannel
    cenarioBcRef.current?.postMessage({ type: "config-update", config });
  }, [config]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { weatherSubTabRef.current = weatherSubTab; }, [weatherSubTab]);
  useEffect(() => { currencySubTabRef.current = currencySubTab; }, [currencySubTab]);

  const [externalConnected, setExternalConnected] = useState(false);
  const [externalRotation, setExternalRotation] = useState(0);
  const [showConnectedMsg, setShowConnectedMsg] = useState(false);
  const fullWindowRef = useRef<Window | null>(null);
  const [isFullWindowOpen, setIsFullWindowOpen] = useState(false);
  const lastPongRef = useRef(0);
  const presenceConnectedRef = useRef(false);
  const presenceShownRef = useRef(false);
  const previewIsLandscape = externalRotation === 90 || externalRotation === 270;

  /* Track opened external windows so their buttons can show active state */
  useEffect(() => {
    const interval = setInterval(() => {
      if (fullWindowRef.current && fullWindowRef.current.closed) {
        fullWindowRef.current = null;
        setIsFullWindowOpen(false);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, []);


  /* Measure preview container to compute scale exactly like CenarioTela */
  useEffect(() => {
    const el = previewWrapRef.current;
    if (!el) return;
    const measure = () => {
      // Internal scale is always PREV_W / container width to keep proportions fixed
      const scale = el.clientWidth / PREV_W;
      setPreviewScale(scale || 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [previewIsLandscape]);

  /* ─── Supabase Realtime Presence for "telas conectadas" ─── */
  useEffect(() => {
    if (!user?.id) return;
    const ch = supabase.channel(`cenario-presence-${user.id}`, { config: { presence: { key: "painel-controle" } } });
    ch.on("presence", { event: "join" }, ({ key }) => {
      if (key === "tela-externa") {
        presenceConnectedRef.current = true;
        setExternalConnected(true);
        if (!presenceShownRef.current) {
          presenceShownRef.current = true;
          setShowConnectedMsg(true);
          setTimeout(() => setShowConnectedMsg(false), 4000);
        }
      }
    });
    ch.on("presence", { event: "leave" }, ({ key }) => {
      if (key === "tela-externa") {
        presenceConnectedRef.current = false;
        setExternalConnected(false);
        presenceShownRef.current = false;
      }
    });
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState();
      const hasExternal = !!state["tela-externa"]?.length;
      presenceConnectedRef.current = hasExternal;
      setExternalConnected(hasExternal);
      if (hasExternal && !presenceShownRef.current) {
        presenceShownRef.current = true;
        setShowConnectedMsg(true);
        setTimeout(() => setShowConnectedMsg(false), 4000);
      }
    });
    ch.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        await ch.track({ screen: "painel-controle", ts: Date.now() });
      }
    });
    return () => { supabase.removeChannel(ch); presenceShownRef.current = false; presenceConnectedRef.current = false; };
  }, [user?.id]);

  const cenarioBcRef = useRef<BroadcastChannel | null>(null);
  useEffect(() => {
    const bc = new BroadcastChannel("cenario-interativo");
    cenarioBcRef.current = bc;
    bc.onmessage = (ev) => {
      if (ev.data?.type === "request-state") {
        bc.postMessage({
          type: "full-state",
          tab: activeTabRef.current,
          subTab: weatherSubTabRef.current,
          currencySubTab: currencySubTabRef.current,
          config: configRef.current,
        });
      }
      if (ev.data?.type === "pong") {
        lastPongRef.current = Date.now();
        setExternalConnected(true);
      }
      if (ev.data?.type === "draw") {
        const canvas = previewCanvasRef.current;
        if (canvas) {
          drawOnCanvas(canvas, ev.data.action, ev.data.px, ev.data.py, ev.data.color, ev.data.width);
          if (ev.data.action === "move") setPreviewHasDrawing(true);
        }
      }
      if (ev.data?.type === "zoom-change" && typeof ev.data.zoom === "number") {
        updateWeather({ zoom: ev.data.zoom });
      }
      if (ev.data?.type === "draw-clear") {
        const canvas = previewCanvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
          setPreviewHasDrawing(false);
        }
      }
      if (ev.data?.type === "draw-shape") {
        const canvas = previewCanvasRef.current;
        if (canvas && ev.data) {
          drawShapeOnCanvas(canvas, ev.data.shape, ev.data.startPx, ev.data.startPy, ev.data.endPx, ev.data.endPy, ev.data.color, ev.data.width);
          setPreviewHasDrawing(true);
        }
      }
    };

    // Ping external screen every 3s (only for same-browser BroadcastChannel)
    const pingInterval = setInterval(() => {
      bc.postMessage({ type: "ping" });
      // If no pong in 5s AND no presence connection, mark offline
      setTimeout(() => {
        if (Date.now() - lastPongRef.current > 5000 && !presenceConnectedRef.current) setExternalConnected(false);
      }, 2000);
    }, 3000);
    // Initial ping
    bc.postMessage({ type: "ping" });

    return () => { cenarioBcRef.current = null; clearInterval(pingInterval); bc.close(); };
  }, [drawOnCanvas]);

  const forceReconnect = useCallback(() => {
    cenarioBcRef.current?.postMessage({ type: "ping" });
    cenarioBcRef.current?.postMessage({ type: "request-state" });
    // Also re-send current state to wake up external screen
    cenarioBcRef.current?.postMessage({
      type: "full-state",
      tab: activeTabRef.current,
      subTab: weatherSubTabRef.current,
      currencySubTab: currencySubTabRef.current,
      config: configRef.current,
    });
  }, []);

  const handleTabChange = (tab: string) => {
    // A aba Cores é apenas uma área de configuração e nunca deve virar cena de saída.
    setSettingsTab(tab);
    if (!VALID_SCENE_TABS.has(tab) || tab === activeTab) return;
    setActiveTab(tab);
    // Mirroring to other devices happens via the main save useEffect
  };
  const handleWeatherSubTabChange = (sub: string) => {
    if (sub === weatherSubTab) return;
    setWeatherSubTab(sub);
  };
  const handleCurrencySubTabChange = (sub: "moedas" | "bolsas") => {
    if (sub === currencySubTab) return;
    setCurrencySubTab(sub);
  };
  const [trafficSearchCity, setTrafficSearchCity] = useState("");
  const [trafficCitySuggestions, setTrafficCitySuggestions] = useState<any[]>([]);
  const [isSearchingCity, setIsSearchingCity] = useState(false);
  const [trafficSearchAddress, setTrafficSearchAddress] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [activeTrafficPointId, setActiveTrafficPointId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const savedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  const [previewChatMessageIdx, setPreviewChatMessageIdx] = useState(0);
  const previewDisplayedMessagesRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (activeTab === "chat" && chatMessages.length > 0) {
      const interval = setInterval(() => {
        setPreviewChatMessageIdx((prevIdx) => {
          const availableIndices = chatMessages
            .map((_, index) => index)
            .filter((index) => !previewDisplayedMessagesRef.current.has(index));

          if (availableIndices.length === 0) {
            previewDisplayedMessagesRef.current.clear();
            return (prevIdx + 1) % chatMessages.length;
          }

          const nextIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
          previewDisplayedMessagesRef.current.add(nextIndex);
          return nextIndex;
        });
      }, 6000);
      return () => clearInterval(interval);
    }
  }, [activeTab, chatMessages.length]);
  const [currentProgram, setCurrentProgram] = useState<{ nome: string; id: string; selo?: string | null; horario_inicio: string; horario_fim: string; apresentador?: string; apresentadorFoto?: string; apresentadoresFotos?: string[]; apresentadorInstagram?: string; tipo_programa?: string | null; thumb?: string | null; capa?: string | null } | null>(null);
  const [presenterIdx, setPresenterIdx] = useState(0);
  const [musicData, setMusicData] = useState<{ titulo: string; artista: string; capa: string } | null>(null);
  const [musicKey, setMusicKey] = useState(0);
  const prevMusicRef = useRef("");
  /* ─── Artist background image (Deezer) ─── */
  const [artistBgUrl, setArtistBgUrl] = useState<string | null>(null);
  const artistBgCacheRef = useRef<Record<string, string>>({});
  const [prevArtistBgUrl, setPrevArtistBgUrl] = useState<string | null>(null);
  const [artistBgReady, setArtistBgReady] = useState(false);
  useEffect(() => {
    if (artistBgUrl) setPrevArtistBgUrl(artistBgUrl);
  }, [artistBgUrl]);

  /* ─── Alternate background mode (preview): absolute 10s slots, matching vMix ─── */
  const altBgPhase: "artist" | "thumb" = config.bgAlternateMode && Math.floor(currentTime.getTime() / 10000) % 2 === 1 ? "thumb" : "artist";
  const [sponsorLogos, setSponsorLogos] = useState<{ id: string; nome: string; logo_url: string }[]>([]);
  const [sponsorIdx, setSponsorIdx] = useState(0);
  const [nextProgram, setNextProgram] = useState<{ nome: string; selo?: string | null; horario_inicio: string; horario_fim: string } | null>(null);
  const [liveWeather, setLiveWeather] = useState<LiveWeather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherCoords, setWeatherCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [trafficCoords, setTrafficCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [liveCurrencies, setLiveCurrencies] = useState<LiveCurrency[]>([]);
  const [currencyLoading, setCurrencyLoading] = useState(false);
  const [liveStocks, setLiveStocks] = useState<LiveStock[]>([]);
  const [stocksLoading, setStocksLoading] = useState(false);
  const [trafficJams, setTrafficJams] = useState<any[]>([]);
  const [trafficJamsLoading, setTrafficJamsLoading] = useState(false);
  const [trafficJamsUpdatedAt, setTrafficJamsUpdatedAt] = useState<string | null>(null);
  const [trafficJamIdx, setTrafficJamIdx] = useState(0);

  /* ─── Fetch artist background from Deezer ─── */
  const exceptionWordsList = (config.home.exceptionWords || "break,vinhetas,hora certa").split(",").map(w => w.trim().toLowerCase()).filter(Boolean);
  const isNoPlayback = [musicData?.titulo, musicData?.artista].some(value => (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().includes("sem reproducao"));
  const isBreakTrack = (() => {
    const titulo = (musicData?.titulo || "").toLowerCase();
    const artista = (musicData?.artista || "").toLowerCase();
    return exceptionWordsList.some(w => titulo === w || artista === w || titulo.includes(w) || artista.includes(w));
  })();
  useEffect(() => {
    if (isBreakTrack || isNoPlayback) { setArtistBgUrl(null); setPrevArtistBgUrl(null); setArtistBgReady(false); return; }
    const artist = musicData?.artista;
    if (!artist || artist === "Desconhecido") { setArtistBgUrl(null); setArtistBgReady(false); return; }
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
        const { data, error } = await supabase.functions.invoke("fetch-artist-image", { body: { artist } });
        if (cancelled) return;
        if (error || !data?.ok || !data?.url) { setArtistBgUrl(null); return; }
        artistBgCacheRef.current[cacheKey] = data.url;
        setArtistBgUrl(data.url);
      } catch { if (!cancelled) setArtistBgUrl(null); }
    })();
    return () => { cancelled = true; };
  }, [musicData?.artista, isBreakTrack, isNoPlayback]);

  /* ─── Clock tick ─── */
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  /* ─── Sponsor logo cycling ─── */
  useEffect(() => {
    if (sponsorLogos.length <= 1) { setSponsorIdx(0); return; }
    const t = setInterval(() => setSponsorIdx(prev => (prev + 1) % sponsorLogos.length), 5000);
    return () => clearInterval(t);
  }, [sponsorLogos.length]);

  /* ─── Music data sync from per-user localStorage ─── */
  useEffect(() => {
    if (!user?.id) {
      setMusicData(null);
      prevMusicRef.current = "";
      return;
    }
    const key = `masterview_music_data::${user.id}`;
    const poll = setInterval(() => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) {
          if (prevMusicRef.current !== "") {
            setMusicData(null);
            prevMusicRef.current = "";
          }
          return;
        }
        const d = JSON.parse(raw);
        const sig = `${d.titulo}|${d.artista}`;
        if (sig !== prevMusicRef.current) {
          prevMusicRef.current = sig;
          setMusicData({ titulo: d.titulo || "", artista: d.artista || "", capa: d.capa || "" });
          setMusicKey(k => k + 1);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(poll);
  }, [user?.id]);
  /* ─── Fetch live currencies ─── */
  useEffect(() => {
    if (!config.currency.enabled || !config.currency.currencies.length) return;
    let cancelled = false;
    const load = async () => {
      setCurrencyLoading(true);
      const data = await fetchLiveCurrencies(config.currency.currencies);
      if (!cancelled) setLiveCurrencies(data);
      setCurrencyLoading(false);
    };
    load();
    const interval = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [config.currency.enabled, config.currency.currencies.join(",")]);

  /* ─── Fetch live stocks ─── */
  useEffect(() => {
    if (!config.currency.enabled) return;
    let cancelled = false;
    const load = async () => {
      setStocksLoading(true);
      const data = await fetchLiveStocks();
      if (!cancelled) setLiveStocks(data);
      setStocksLoading(false);
    };
    load();
    const interval = setInterval(load, 120000); // refresh every 2min
    return () => { cancelled = true; clearInterval(interval); };
  }, [config.currency.enabled]);

  /* ─── Fetch current program + sponsor logos ─── */
  useEffect(() => {
    const ownerId = targetUserId;
    if (!ownerId) {
      setCurrentProgram(null);
      setSponsorLogos([]);
      setNextProgram(null);
      return;
    }
    const load = async () => {
      const now = new Date();
      // Timezone São Paulo
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).formatToParts(now);
      const h = Number(parts.find(p => p.type === "hour")?.value || 0);
      const m = Number(parts.find(p => p.type === "minute")?.value || 0);
      const s = Number(parts.find(p => p.type === "second")?.value || 0);
      const nowSeconds = h * 3600 + m * 60 + s;

      const dayNameMap: Record<string, string> = {
        domingo: "Domingo",
        "segunda-feira": "Segunda",
        "terça-feira": "Terça",
        "quarta-feira": "Quarta",
        "quinta-feira": "Quinta",
        "sexta-feira": "Sexta",
        sábado: "Sábado",
      };
      const dayRaw = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "long" }).format(now).toLowerCase();
      const today = dayNameMap[dayRaw] || "Segunda";
      const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

      const parseTimeToSec = (t: string | null | undefined): number => {
        if (!t) return -1;
        const [hh = "0", mm = "0"] = String(t).split(":");
        return Number(hh) * 3600 + Number(mm) * 60;
      };

      const acc = findClientAccountById(ownerId) || 
                  findClientAccountByEmail(ownerId) || 
                  findClientAccountByEmail(user?.email);
      const stationUid = acc?.id || acc?.parentUserId || ownerId;

      const { data: progs } = await supabase
        .from("programas")
        .select("id, nome, horario_inicio, horario_fim, dias_semana, selo, thumb, capa, apresentador_id, apresentadores_ids, tipo_programa, estudio, variavel, data_variavel")
        .in("user_id", Array.from(new Set([ownerId, stationUid].filter(Boolean))))
        .eq("ativo", true);

      let allProgs: any[] = (progs || []).map((p: any) => ({
        id: p.id,
        nome: p.nome,
        horario_inicio: p.horario_inicio,
        horario_fim: p.horario_fim,
        dias_semana: p.dias_semana || [],
        selo: p.selo,
        thumb: p.thumb,
        capa: p.capa,
        apresentador_id: p.apresentador_id,
        apresentadores_ids: p.apresentadores_ids || [],
        tipo_programa: p.tipo_programa,
        estudio: p.estudio || "ESTÚDIO PRINCIPAL (AO VIVO)",
        variavel: p.variavel,
        data_variavel: p.data_variavel,
      }));

      // Enrich with House Mix / station schedule programs
      try {
        const hmProgs = getClientHouseMixProgramsSync(acc || stationUid || ownerId, user?.email);
        if (Array.isArray(hmProgs) && hmProgs.length > 0) {
          hmProgs.forEach((hp: any) => {
            if (!allProgs.some((p: any) => p.nome?.trim().toLowerCase() === hp.nome?.trim().toLowerCase())) {
              allProgs.push({
                id: hp.id,
                nome: hp.nome,
                horario_inicio: hp.horario_inicio,
                horario_fim: hp.horario_fim,
                dias_semana: hp.dias_semana || ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"],
                selo: hp.selo || null,
                thumb: hp.thumb || null,
                capa: hp.capa || null,
                apresentador_id: hp.apresentador_id || null,
                apresentadores_ids: hp.apresentadores_ids || [],
                tipo_programa: hp.tipo_programa || null,
                estudio: hp.estudio || "ESTÚDIO PRINCIPAL (AO VIVO)",
                variavel: false,
                data_variavel: null,
              });
            }
          });
        }
      } catch (err) {
        console.warn("Erro ao buscar programas House Mix no CenarioInterativoPage:", err);
      }

      const candidates = allProgs.filter(p => {
        if (p.variavel && p.data_variavel !== dateStr) return false;
        if (!p.variavel) {
          const dias = (p.dias_semana || []).map((d: string) => String(d).toLowerCase());
          const todayLower = today.toLowerCase();
          const isAllDays = dias.length === 0 || dias.some((d: string) => d.includes("todos") || d.includes("diário") || d.includes("diario"));
          const hasDay = isAllDays || dias.some((d: string) => d.includes(todayLower) || todayLower.includes(d));
          if (!hasDay) return false;
        }
        const start = parseTimeToSec(p.horario_inicio);
        const end = parseTimeToSec(p.horario_fim);
        if (start < 0 || end < 0) return false;
        if (end <= start) {
          return nowSeconds >= start || nowSeconds < end;
        }
        return nowSeconds >= start && nowSeconds < end;
      });

      // Prioritize primary / live on-air studio (Estúdio FM, Estúdio Principal, Ao Vivo) or fallback to any candidate
      const mainStudioMatch = candidates.find(p => {
        const est = (p.estudio || "").toLowerCase();
        return est.includes("fm") || est.includes("principal") || est.includes("ao vivo");
      });
      const onAir = mainStudioMatch || (candidates.length > 0 ? candidates[0] : null);

      if (onAir) {
        let apresentadorNome = "";
        let apresentadorFoto = "";
        let apresentadoresFotos: string[] = [];
        let apresentadorInstagram = "";
        const apIds = onAir.apresentadores_ids?.length ? onAir.apresentadores_ids : onAir.apresentador_id ? [onAir.apresentador_id] : [];
        if (apIds.length) {
          const { data: aps } = await supabase.from("apresentadores").select("nome, foto, instagram").in("id", apIds);
          apresentadorNome = aps?.map(a => a.nome).join(", ") || "";
          apresentadoresFotos = (aps || []).map(a => a.foto).filter((f): f is string => !!f);
          apresentadorFoto = apresentadoresFotos[0] || "";
          apresentadorInstagram = aps?.map(a => a.instagram).filter(i => !!i).join(", ") || "";
        }
        setCurrentProgram({ 
          nome: onAir.nome, 
          id: onAir.id, 
          selo: onAir.selo, 
          thumb: (onAir as any).thumb || null, 
          capa: (onAir as any).capa || null, 
          horario_inicio: onAir.horario_inicio, 
          horario_fim: onAir.horario_fim, 
          apresentador: apresentadorNome, 
          apresentadorFoto, 
          apresentadoresFotos, 
          apresentadorInstagram, 
          tipo_programa: onAir.tipo_programa 
        });
        const { data: logos } = await supabase
          .from("logos_patrocinadores")
          .select("id, nome, logo_url, programa_id")
          .in("user_id", Array.from(new Set([ownerId, stationUid].filter(Boolean))))
          .eq("ativo", true)
          .eq("excluido", false);
        const filteredLogos = (logos || []).filter(l => 
          l.programa_id === onAir.id || 
          l.programa_id === onAir.nome ||
          (l as any).programa_nome === onAir.nome
        );
        setSponsorLogos(filteredLogos);

        // Find next program
        const upcoming = allProgs
          .filter(p => {
            if (p.id === onAir.id || p.nome === onAir.nome) return false;
            if (p.variavel && p.data_variavel !== dateStr) return false;
            if (!p.variavel) {
              const dias = (p.dias_semana || []).map((d: string) => String(d).toLowerCase());
              const todayLower = today.toLowerCase();
              const isAllDays = dias.length === 0 || dias.some((d: string) => d.includes("todos") || d.includes("diário") || d.includes("diario"));
              const hasDay = isAllDays || dias.some((d: string) => d.includes(todayLower) || todayLower.includes(d));
              if (!hasDay) return false;
            }
            const sSec = parseTimeToSec(p.horario_inicio);
            return sSec > nowSeconds;
          })
          .sort((a, b) => (parseTimeToSec(a.horario_inicio) - parseTimeToSec(b.horario_inicio)));

        if (upcoming.length > 0) {
          const np = upcoming[0];
          setNextProgram({ nome: np.nome, selo: np.selo, horario_inicio: np.horario_inicio, horario_fim: np.horario_fim });
        } else {
          setNextProgram(null);
        }

        // Fetch chat data if enabled
        if (config.chat?.enabled && config.chat?.youtubeVideoUrl) {
          try {
            const timeStr = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
            const baseUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/public-cenario-data?uid=${ownerId}&day=${encodeURIComponent(today)}&time=${timeStr}&ytUrl=${encodeURIComponent(config.chat.youtubeVideoUrl)}&_t=${Date.now()}`;
            const resp = await fetch(baseUrl, {
              headers: { "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
            });
            if (resp.ok) {
              const json = await resp.json();
              if (json?.youtubeChatMessages) {
                setChatMessages(json.youtubeChatMessages);
              } else {
                setChatMessages([]);
              }
            }
          } catch (err) {
            console.error("Error fetching chat in preview:", err);
          }
        }
      } else {
        setCurrentProgram(null);
        setSponsorLogos([]);
        setNextProgram(null);
      }
    };
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [targetUserId, config.chat?.enabled, config.chat?.youtubeVideoUrl]);

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

  /* ─── Load from DB (with local cache fallback) ─── */
  useEffect(() => {
    const applyCachedConfig = () => {
      try {
        const raw = localStorage.getItem("cenario_interativo_config_cache_v1");
        if (!raw) return false;
        const parsed = JSON.parse(raw) as Partial<CenarioConfig>;
        if (parsed && typeof parsed === "object") {
          setConfig(prev => ({ ...prev, ...parsed }));
          return true;
        }
      } catch {
        // silent
      }
      return false;
    };

    if (!user?.id) {
      applyCachedConfig();
      setLoaded(true);
      return;
    }

    (async () => {
      const { data } = await supabase
        .from("user_settings")
        .select("cenario_config" as any)
        .eq("user_id", user.id)
        .maybeSingle();

      let finalConfig = { ...defaultConfig };
      let finalActiveTab = 'home';
      let finalWeatherTab = 'today';
      let finalCurrencyTab: "moedas" | "bolsas" = 'moedas';
      let finalRotation = 0;

      if ((data as any)?.cenario_config && typeof (data as any).cenario_config === "object") {
        const savedConfig = (data as any).cenario_config as any;
        finalConfig = { ...defaultConfig, ...savedConfig };
        if (savedConfig._activeTab) finalActiveTab = normalizeSceneTab(savedConfig._activeTab);
        if (savedConfig._weatherSubTab) finalWeatherTab = savedConfig._weatherSubTab;
        if (savedConfig._currencySubTab) finalCurrencyTab = savedConfig._currencySubTab;
        if (typeof savedConfig._screenRotation === "number") finalRotation = savedConfig._screenRotation;
        
        setConfig(finalConfig);
        setActiveTab(finalActiveTab);
        setSettingsTab(finalActiveTab);
        setWeatherSubTab(finalWeatherTab);
        setCurrencySubTab(finalCurrencyTab);
        setExternalRotation(finalRotation);

        try {
          localStorage.setItem("cenario_interativo_config_cache_v1", JSON.stringify(finalConfig));
        } catch { /* silent */ }
      } else {
        applyCachedConfig();
        // Se aplicou cache, os estados já foram atualizados via setConfig no applyCachedConfig
      }

      // Inicializa o prevSaveRef para evitar salvamento imediato no mount
      const initialSerialized = JSON.stringify({
        ...finalConfig,
        _activeTab: finalActiveTab,
        _weatherSubTab: finalWeatherTab,
        _currencySubTab: finalCurrencyTab,
        _screenRotation: finalRotation,
      });
      prevSaveRef.current = initialSerialized;
      setLoaded(true);
    })();
  }, [user?.id]);

  /* ─── Keep local cache + live sync for /cenario-tela ─── */
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem("cenario_interativo_config_cache_v1", JSON.stringify(config));
    } catch {
      // silent
    }

    cenarioBcRef.current?.postMessage({ type: "config-update", config });
    // Usamos broadcast do canal de tempo real para maior velocidade de sincronização
    rtDrawChannelRef.current?.send({ 
      type: "broadcast", 
      event: "config-update", 
      payload: { config } 
    });
  }, [config, loaded]);

  /* ─── Fetch weather data ─── */
  const weatherCity = config.weather.city || config.city;
  const weatherFetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!config.weather.enabled || !weatherCity) return;
    if (weatherFetchRef.current) clearTimeout(weatherFetchRef.current);
    weatherFetchRef.current = setTimeout(async () => {
      setWeatherLoading(true);
      try {
        // 1. Geocode city
        const { data: geoData } = await supabase.functions.invoke("fetch-weather", {
          body: { action: "geocode", query: weatherCity, count: 1 },
        });
        const results = geoData?.results;
        if (!results || results.length === 0) {
          setLiveWeather(null);
          setWeatherLoading(false);
          return;
        }
        const { latitude, longitude } = results[0];
        setWeatherCoords({ lat: latitude, lon: longitude });
        updateWeather({ lat: latitude, lon: longitude });
        // 2. Get forecast
        const { data: forecastData } = await supabase.functions.invoke("fetch-weather", {
          body: { action: "forecast", lat: latitude, lon: longitude, forecast_days: 5 },
        });
        if (forecastData?.ok && forecastData.data) {
          const d = forecastData.data;
          setLiveWeather({
            current: {
              temp: Math.round(d.current?.temperature_2m ?? 0),
              humidity: Math.round(d.current?.relative_humidity_2m ?? 0),
              code: d.current?.weather_code ?? 0,
            },
            daily: (d.daily?.time || []).map((date: string, i: number) => ({
              date,
              min: Math.round(d.daily.temperature_2m_min?.[i] ?? 0),
              max: Math.round(d.daily.temperature_2m_max?.[i] ?? 0),
              code: d.daily.weather_code?.[i] ?? 0,
              humidity: Math.round(d.daily.relative_humidity_2m_max?.[i] ?? 0),
              precip: Math.round(d.daily.precipitation_probability_max?.[i] ?? 0),
              rainMm: Math.round((d.daily.precipitation_sum?.[i] ?? 0) * 10) / 10,
              windMax: Math.round(d.daily.wind_speed_10m_max?.[i] ?? 0),
            })),
          });
        }
      } catch (err) {
        console.error("Weather fetch error:", err);
      }
      setWeatherLoading(false);
    }, 1000);
    return () => { if (weatherFetchRef.current) clearTimeout(weatherFetchRef.current); };
  }, [config.weather.enabled, weatherCity]);

  /* ─── Geocode traffic city ─── */
  const trafficCity = config.traffic.city || config.city;
  const trafficGeoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  useEffect(() => {
    if (trafficCity) {
      setTrafficSearchCity(trafficCity);
    }
  }, [trafficCity]);

  useEffect(() => {
    if (!config.traffic.enabled || !trafficCity) { setTrafficCoords(null); return; }
    // If config already has lat/lon from a previous geocode or manual input, use those
    if (config.traffic.lat != null && config.traffic.lon != null) {
      setTrafficCoords({ lat: config.traffic.lat, lon: config.traffic.lon });
      return;
    }
    if (trafficGeoRef.current) clearTimeout(trafficGeoRef.current);
    trafficGeoRef.current = setTimeout(async () => {
      try {
        const { data: geoData } = await supabase.functions.invoke("fetch-weather", {
          body: { action: "geocode", query: trafficCity, count: 1 },
        });
        const results = geoData?.results;
        if (results?.length) {
          const lat = results[0].latitude;
          const lon = results[0].longitude;
          setTrafficCoords({ lat, lon });
          updateTraffic({ lat, lon });
          // If a search address was set but not a point, we could update it here
          // but usually it's better to wait for the user to select an address.
        }
      } catch { /* silent */ }
    }, 1000);
    return () => { if (trafficGeoRef.current) clearTimeout(trafficGeoRef.current); };
  }, [config.traffic.enabled, trafficCity, config.traffic.lat, config.traffic.lon]);

  /* ─── Fetch live traffic incidents (HERE API) ─── */
  useEffect(() => {
    if (!config.traffic.enabled || !trafficCity) { setTrafficJams([]); return; }
    let cancelled = false;
    const load = async () => {
      setTrafficJamsLoading(true);
      try {
        const { data } = await supabase.functions.invoke("fetch-traffic", { body: { city: trafficCity } });
        if (cancelled) return;
        if (data?.ok) {
          setTrafficJams(Array.isArray(data.jams) ? data.jams : []);
          setTrafficJamsUpdatedAt(data.updatedAt || null);
          setTrafficJamIdx(0);
        }
      } catch { /* silent */ }
      finally { if (!cancelled) setTrafficJamsLoading(false); }
    };
    load();
    const iv = setInterval(load, 3 * 60 * 1000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [config.traffic.enabled, trafficCity]);

  useEffect(() => {
    if (trafficJams.length <= 1) return;
    const iv = setInterval(() => setTrafficJamIdx(v => (v + 1) % trafficJams.length), 5000);
    return () => clearInterval(iv);
  }, [trafficJams.length]);


  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSaveRef = useRef<string>("");
  const pendingSaveRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (!user?.id || !loaded) return;
    
    const configWithTabs = {
      ...config,
      _activeTab: activeTab,
      _weatherSubTab: weatherSubTab,
      _currencySubTab: currencySubTab,
      _screenRotation: externalRotation,
    };
    const serialized = JSON.stringify(configWithTabs);

    // If it's the same as what we already have, don't do anything
    if (serialized === prevSaveRef.current) return;

    // Se a mudança veio de outro dispositivo via broadcast, não salvamos novamente no banco
    if (isRemoteUpdateRef.current) {
      console.log("Cenário: Ignorando salvamento de atualização remota");
      isRemoteUpdateRef.current = false;
      prevSaveRef.current = serialized;
      return;
    }

    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    
    const doSave = async () => {
      // Check again if still different before actual DB call
      if (serialized === prevSaveRef.current) {
        pendingSaveRef.current = null;
        return;
      }

      prevSaveRef.current = serialized;
      pendingSaveRef.current = null;
      setSaving(true);
      
      try {
        const payload = { user_id: user.id, cenario_config: configWithTabs } as any;
        const { error } = await supabase
          .from("user_settings")
          .upsert(payload, { onConflict: "user_id" });

        if (error) {
          console.error("Erro ao salvar cenário:", error);
        } else {
          setSavedFlash(true);
          if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
          savedFlashTimer.current = setTimeout(() => setSavedFlash(false), 2500);

          // Notifica todas as telas conectadas sobre a mudança de configuração
          // Usamos o objeto serializado para garantir consistência
          rtDrawChannelRef.current?.send({
            type: "broadcast",
            event: "config-update",
            payload: { config: configWithTabs }
          });
        }
      } catch (err) {
        console.error("Critical save error:", err);
      } finally {
        setSaving(false);
      }
    };
    
    pendingSaveRef.current = doSave;
    saveTimeout.current = setTimeout(doSave, 800); // Reduzido de 1500ms para 800ms para salvar mais rápido no banco
    
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
    };
  }, [config, user?.id, loaded, activeTab, weatherSubTab, currencySubTab, externalRotation]);

  const updateHome = (partial: Partial<HomeConfig>) => {
    setConfig(c => ({ ...c, home: { ...c.home, ...partial } }));
  };
  const updateWeather = (partial: Partial<WeatherConfig>) => {
    setConfig(c => {
      const newWeather = { ...c.weather, ...partial };
      const newConfig = { ...c, weather: newWeather };
      
      // Sincronização rápida via realtime broadcast para a tela externa
      rtDrawChannelRef.current?.send({
        type: "broadcast",
        event: "config-update",
        payload: { config: newConfig }
      });
      
      return newConfig;
    });
  };
  const updateTraffic = (partial: Partial<TrafficConfig>) => {
    setConfig(c => ({ ...c, traffic: { ...c.traffic, ...partial } }));
  };
  const updateCurrency = (partial: Partial<CurrencyConfig>) => {
    setConfig(c => ({ ...c, currency: { ...c.currency, ...partial } }));
  };
  const updateChat = (partial: Partial<ChatConfig>) => {
    setConfig(c => ({ ...c, chat: { ...c.chat, ...partial } }));
    if (partial.youtubeVideoUrl !== undefined) {
      setChatMessages([]);
    }
  };

  const getElPos = useCallback((id: string): ElementPosition => {
    return config.home.elementPositions?.[id] ?? defaultPositions[id] ?? { x: 50, y: 50, scale: 1 };
  }, [config.home.elementPositions]);

  const handleElMove = useCallback((id: string, pos: ElementPosition) => {
    setConfig(c => ({
      ...c,
      home: {
        ...c.home,
        elementPositions: { ...c.home.elementPositions, [id]: pos },
      },
    }));
    
    // Broadcast instantâneo da mudança de posição do elemento para as telas
    rtDrawChannelRef.current?.send({
      type: "broadcast",
      event: "element-move",
      payload: { id, pos }
    });
  }, []);

  const removeTrafficPoint = (id: string) =>
    updateTraffic({ points: config.traffic.points.filter(p => p.id !== id) });

  const toggleFavoritePoint = (p: TrafficPoint) => {
    const favorites = config.traffic.favorites || [];
    const isFavorite = favorites.some(f => f.id === p.id);
    const newFavorites = isFavorite 
      ? favorites.filter(f => f.id !== p.id) 
      : [...favorites, p];
    
    updateTraffic({ favorites: newFavorites });
    toast.success(isFavorite ? "Removido dos favoritos" : "Adicionado aos favoritos");
  };

  const loadFavoritePoint = (p: TrafficPoint) => {
    // Add to current points if not already there
    if (!config.traffic.points.some(pt => pt.id === p.id)) {
      updateTraffic({ 
        points: [...config.traffic.points, p],
        lat: p.lat,
        lon: p.lng,
        zoom: 15
      });
    } else {
      goToTrafficPoint(p);
    }
  };

  const updateTrafficPointPosition = async (id: string, lat: number, lng: number) => {
    try {
      // Reverse geocode to get a label if it was moved to a new place
      const { data } = await supabase.functions.invoke("fetch-weather", {
        body: { action: "geocode", query: `${lat}, ${lng}`, count: 1 },
      });
      
      const newLabel = data?.results?.[0]?.display_name?.split(',')[0] || `Ponto ${config.traffic.points.findIndex(p => p.id === id) + 1}`;
      
      const updatedPoints = config.traffic.points.map(p => 
        p.id === id ? { ...p, lat, lng, label: newLabel } : p
      );
      
      updateTraffic({ points: updatedPoints });
      toast.success("Posição do ponto atualizada");
    } catch (err) {
      console.error("Error updating point position:", err);
      // Fallback update without geocoding
      const updatedPoints = config.traffic.points.map(p => 
        p.id === id ? { ...p, lat, lng } : p
      );
      updateTraffic({ points: updatedPoints });
    }
  };

  const goToTrafficPoint = (p: TrafficPoint) => {
    setTrafficCoords({ lat: p.lat, lon: p.lng });
    updateTraffic({ lat: p.lat, lon: p.lng, zoom: 15 });
    setActiveTrafficPointId(p.id);
    toast.info(`Navegando para: ${p.label}`);
    
    // Auto clear active state after some time
    setTimeout(() => {
      setActiveTrafficPointId(null);
    }, 4000);
  };

  const toggleCurrency = (code: string) => {
    const has = config.currency.currencies.includes(code);
    updateCurrency({ currencies: has ? config.currency.currencies.filter(c => c !== code) : [...config.currency.currencies, code] });
  };

  const handleTrafficCityInput = async (query: string) => {
    setTrafficSearchCity(query);
    if (query.length < 2) {
      setTrafficCitySuggestions([]);
      return;
    }
    setIsSearchingCity(true);
    try {
      const { data } = await supabase.functions.invoke("fetch-weather", {
        body: { action: "geocode", query, count: 5 },
      });
      if (data?.results) setTrafficCitySuggestions(data.results);
    } catch (err) {
      console.error("City search error:", err);
    }
    setIsSearchingCity(false);
  };

  const selectTrafficCity = (city: any) => {
    const cityName = city.name;
    const { latitude, longitude } = city;
    setTrafficSearchCity(cityName);
    setTrafficCitySuggestions([]);
    setTrafficCoords({ lat: latitude, lon: longitude });
    updateTraffic({ city: cityName, lat: latitude, lon: longitude, zoom: 12 });
    if (!config.city) setConfig(c => ({ ...c, city: cityName }));
  };

  const handleTrafficSearch = async () => {
    if (!trafficSearchCity.trim()) return;
    setWeatherLoading(true);
    try {
      const { data: geoData } = await supabase.functions.invoke("fetch-weather", {
        body: { action: "geocode", query: trafficSearchCity.trim(), count: 1 },
      });
      const results = geoData?.results;
      if (results && results.length > 0) {
        const { latitude, longitude } = results[0];
        const cityName = trafficSearchCity.trim();
        setTrafficCoords({ lat: latitude, lon: longitude });
        updateTraffic({ city: cityName, lat: latitude, lon: longitude, zoom: 12 });
        if (!config.city) setConfig(c => ({ ...c, city: cityName }));
      } else {
        toast.error("Cidade não encontrada");
      }
    } catch (err) {
      console.error("Traffic search error:", err);
    }
    setWeatherLoading(false);
  };

  const searchAddress = async (query: string) => {
    setTrafficSearchAddress(query);
    if (query.length < 2) {
      setAddressSuggestions([]);
      return;
    }
    
    setIsSearchingAddress(true);
    try {
      // Use the last typed traffic city as a filter
      const cityFilter = trafficSearchCity || config.traffic.city || config.city;
      const fullQuery = cityFilter ? `${query}, ${cityFilter}` : query;
      
      const { data } = await supabase.functions.invoke("fetch-weather", {
        body: { action: "geocode", query: fullQuery, count: 5 },
      });
      
      if (data?.results) {
        setAddressSuggestions(data.results);
      }
    } catch (err) {
      console.error("Address search error:", err);
    }
    setIsSearchingAddress(false);
  };

  const selectAddress = (addr: any) => {
    const lat = addr.latitude;
    const lon = addr.longitude;
    const addressName = addr.name || "";
    setTrafficCoords({ lat, lon });
    updateTraffic({ lat, lon, zoom: 15 });
    setTrafficSearchAddress(addressName);
    setAddressSuggestions([]);

    // Automatically add point when selecting from autocomplete
    const newPoint: TrafficPoint = {
      id: Math.random().toString(36).substring(2, 9),
      label: addressName,
      lat,
      lng: lon,
    };
    updateTraffic({ 
      lat, 
      lon, 
      zoom: 15,
      points: [...config.traffic.points, newPoint] 
    });
    toast.success("Endereço marcado no mapa");
  };

  const addTrafficPoint = () => {
    const lat = config.traffic.lat ?? trafficCoords?.lat;
    const lon = config.traffic.lon ?? trafficCoords?.lon;
    if (lat === undefined || lon === undefined || lat === null || lon === null) {
      toast.error("Busque um endereço primeiro");
      return;
    }

    const newPoint: TrafficPoint = {
      id: Math.random().toString(36).substring(2, 9),
      label: trafficSearchAddress || `Ponto ${config.traffic.points.length + 1}`,
      lat,
      lng: lon,
    };
    updateTraffic({ points: [...config.traffic.points, newPoint] });
    toast.success("Ponto marcado no mapa");
  };

  const trafficMapCity = config.traffic.city || config.city || "São Paulo";
  const uid = user?.id;

  /* ─── styles ─── */
  const headerStyle = {
    background: "linear-gradient(135deg, var(--layout-header-bg, #0d0446), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))",
    color: "var(--layout-header-text, #ffffff)",
  };
  const pageStyle = {
    background: "var(--layout-page-bg, #ffffff)",
    boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
    border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 20%, transparent)",
  };
  const textColor = "var(--layout-page-text, #1a1a1a)";
  const mutedText = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)";
  const subTabBg = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)";
  const subTabActive = "var(--layout-header-bg, #0d0446)";

  // Helper function to get contrast text color based on accent background
  const getContrastColor = (bgColorVar: string) => {
    return `color-mix(in srgb, ${bgColorVar}, white 80%)`;
  };

  const accentColor = "var(--layout-accent-color, #3b82f6)";
  const accentContrast = getContrastColor(accentColor);

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header handled by Dashboard Portal */}
      <div id="module-header-title" style={{ display: "none" }}>
        vMix — CENÁRIO INTERATIVO
      </div>

      <div className="overflow-visible bg-transparent border-0">
        <div className="p-0 flex flex-col lg:flex-row gap-6" style={{ color: textColor }}>


          {/* ── LEFT: Configuration ── */}
          <div className="flex-1 min-w-0">
            <div className="h-0" aria-hidden="true" />

            <Tabs value={settingsTab} onValueChange={handleTabChange}>
              <TabsList className="w-full grid grid-cols-7 gap-1 p-1 mb-4 rounded-xl" style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>
                <TabsTrigger value="home" title="Home" aria-label="Home" className="h-9 w-full p-0 justify-center rounded-lg text-xs transition-colors data-[state=active]:bg-[var(--layout-accent-color)] data-[state=active]:text-white data-[state=active]:shadow-sm"><Home size={16} /></TabsTrigger>
                <TabsTrigger value="weather" title="Tempo" aria-label="Tempo" className="h-9 w-full p-0 justify-center rounded-lg text-xs transition-colors data-[state=active]:bg-[var(--layout-accent-color)] data-[state=active]:text-white data-[state=active]:shadow-sm"><CloudSun size={16} /></TabsTrigger>
                <TabsTrigger value="traffic" title="Trânsito" aria-label="Trânsito" className="h-9 w-full p-0 justify-center rounded-lg text-xs transition-colors data-[state=active]:bg-[var(--layout-accent-color)] data-[state=active]:text-white data-[state=active]:shadow-sm"><Car size={16} /></TabsTrigger>
                <TabsTrigger value="currency" title="Cotação" aria-label="Cotação" className="h-9 w-full p-0 justify-center rounded-lg text-xs transition-colors data-[state=active]:bg-[var(--layout-accent-color)] data-[state=active]:text-white data-[state=active]:shadow-sm"><DollarSign size={16} /></TabsTrigger>
                <TabsTrigger value="enquete" title="Enquete" aria-label="Enquete" className="h-9 w-full p-0 justify-center rounded-lg text-xs relative transition-colors data-[state=active]:bg-[var(--layout-accent-color)] data-[state=active]:text-white data-[state=active]:shadow-sm">
                  <Tag size={16} />
                  {enquetes.length > 0 && (
                    <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-red-500 rounded-full border border-white animate-pulse" title="Enquetes disponíveis" />
                  )}
                </TabsTrigger>
                <TabsTrigger value="chat" title="Chat" aria-label="Chat" className="h-9 w-full p-0 justify-center rounded-lg text-xs transition-colors data-[state=active]:bg-[var(--layout-accent-color)] data-[state=active]:text-white data-[state=active]:shadow-sm"><MessageCircle size={16} /></TabsTrigger>
                <TabsTrigger value="colors" title="Configuração de cores" aria-label="Configuração de cores" className="h-9 w-full p-0 justify-center rounded-lg text-xs transition-colors data-[state=active]:bg-[var(--layout-accent-color)] data-[state=active]:text-white data-[state=active]:shadow-sm"><Settings size={16} /></TabsTrigger>
              </TabsList>

              {/* ═══ Home ═══ */}
              <TabsContent value="home" className="space-y-4 animate-in fade-in-50 duration-500">
                <div className="flex flex-col gap-3">
                  {/* Visibilidade das Capas — recolhida por padrão e expansível */}
                  <div className="p-4 rounded-xl border-2 border-[var(--layout-accent-color)]/60 bg-white/40 space-y-3">
                    <button
                      type="button"
                      className="w-full flex items-center gap-2 text-left"
                      aria-expanded={!!openSections.visibilityCovers}
                      onClick={() => setOpenSections(prev => ({ ...prev, visibilityCovers: !prev.visibilityCovers }))}
                    >
                      <div className="p-1.5 rounded-lg bg-[var(--layout-accent-color)]/10 text-[var(--layout-accent-color)]">
                        <Eye size={16} />
                      </div>
                      <h4 className="text-xs font-bold uppercase tracking-wider flex-1">Visibilidade das Capas</h4>
                      {openSections.visibilityCovers ? <ChevronUp size={14} className="opacity-50" /> : <ChevronDown size={14} className="opacity-50" />}
                    </button>
                    {openSections.visibilityCovers && (
                      <div className="space-y-2 pt-3 border-t border-black/5 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="flex items-center justify-between">
                          <Label className="text-[10px] font-bold uppercase opacity-70">Exibir Capa da Música</Label>
                          <Switch
                            checked={config.home.showMusicCover !== false}
                            onCheckedChange={v => updateHome({ showMusicCover: v })}
                            className="data-[state=checked]:bg-[var(--layout-accent-color)]"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Configurações Visuais de Fundo */}
                  <div className="space-y-4">
                    <style>
                      {`
                        #cenario-bg-configs .grid > div {
                          border-color: color-mix(in srgb, var(--layout-accent-color) 60%, transparent) !important;
                        }
                      `}
                    </style>
                    <div id="cenario-bg-configs" className="space-y-4">
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {/* 1 - Fundo Estático */}
                      <div className={`flex flex-col gap-3 p-4 rounded-xl border-2 transition-all ${config.bgType === 'static' ? 'bg-[var(--layout-accent-color)]/10 border-[var(--layout-accent-color)]/60' : 'bg-white/40 border-[var(--layout-accent-color)]/60'}`}>
                        <div className="flex items-center justify-between">
                          <button 
                            className="flex items-center gap-2 flex-1 text-left"
                            onClick={() => setOpenSections(prev => ({ ...prev, static: !prev.static }))}
                          >
                            <div className={`p-1.5 rounded-lg ${config.bgType === 'static' ? 'bg-[var(--layout-accent-color)] text-white' : 'bg-[var(--layout-accent-color)]/10 text-[var(--layout-accent-color)]'}`}>
                              <Image size={16} />
                            </div>
                            <div className="flex flex-col">
                              <h4 className="text-xs font-bold uppercase tracking-wider">1. Fundo Estático</h4>
                            </div>
                            {openSections.static ? <ChevronUp size={14} className="opacity-40 ml-auto" /> : <ChevronDown size={14} className="opacity-40 ml-auto" />}
                          </button>
                          <div className="pl-4 border-l border-black/5 ml-2">
                            <Switch 
                              checked={config.bgType === 'static'} 
                              onCheckedChange={(checked) => setConfig(c => ({ ...c, bgType: checked ? 'static' : 'none' }))}
                              className="data-[state=checked]:bg-[var(--layout-accent-color)]"
                            />
                          </div>
                        </div>
                        {openSections.static && (
                          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                            <BgImageUpload value={config.home.bgImage} onChange={v => updateHome({ bgImage: v })} mutedText={mutedText} userId={uid} category="home" />
                          </div>
                        )}
                      </div>

                      {/* 2 - Fundo Degradê */}
                      <div className={`flex flex-col gap-3 p-4 rounded-xl border-2 transition-all ${config.bgType === 'gradient' ? 'bg-[var(--layout-accent-color)]/10 border-[var(--layout-accent-color)]/60' : 'bg-white/40 border-[var(--layout-accent-color)]/60'}`}>
                        <div className="flex items-center justify-between">
                          <button 
                            className="flex items-center gap-2 flex-1 text-left"
                            onClick={() => setOpenSections(prev => ({ ...prev, gradient: !prev.gradient }))}
                          >
                            <div className={`p-1.5 rounded-lg ${config.bgType === 'gradient' ? 'bg-[var(--layout-accent-color)] text-white' : 'bg-[var(--layout-accent-color)]/10 text-[var(--layout-accent-color)]'}`}>
                              <Palette size={16} />
                            </div>
                            <h4 className="text-xs font-bold uppercase tracking-wider">2. Fundo Degradê</h4>
                            {openSections.gradient ? <ChevronUp size={14} className="opacity-40 ml-auto" /> : <ChevronDown size={14} className="opacity-40 ml-auto" />}
                          </button>
                          <div className="pl-4 border-l border-black/5 ml-2">
                            <Switch 
                              checked={config.bgType === 'gradient'} 
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setConfig(c => ({ ...c, bgType: 'gradient' }));
                                  updateHome({ bgGradient: true });
                                } else {
                                  setConfig(c => ({ ...c, bgType: 'none' }));
                                }
                              }}
                              className="data-[state=checked]:bg-[var(--layout-accent-color)]"
                            />
                          </div>
                        </div>
                        
                        {openSections.gradient && config.bgType === 'gradient' && (
                          <div className="space-y-3 pt-1 animate-in slide-in-from-top-2 duration-300">
                            <GradientPicker
                              colorA={config.home.bgGradientColorA || "#1a1a2e"}
                              colorB={config.home.bgGradientColorB || "#16213e"}
                              angle={config.home.bgGradientAngle ?? 135}
                              gradientType={config.home.bgGradientType || "linear"}
                              onChangeColorA={v => updateHome({ bgGradientColorA: v })}
                              onChangeColorB={v => updateHome({ bgGradientColorB: v })}
                              onChangeAngle={v => updateHome({ bgGradientAngle: v })}
                              onChangeType={v => updateHome({ bgGradientType: v })}
                              showType
                            />
                          </div>
                        )}
                      </div>

                      {/* 3 - Fundo Thumb */}
                      <div className={`flex flex-col gap-3 p-4 rounded-xl border-2 transition-all ${config.bgType === 'thumb' ? 'bg-[var(--layout-accent-color)]/10 border-[var(--layout-accent-color)]/60' : 'bg-white/40 border-[var(--layout-accent-color)]/60'}`}>
                        <div className="flex items-center justify-between">
                          <button 
                            className="flex items-center gap-2 flex-1 text-left"
                            onClick={() => setOpenSections(prev => ({ ...prev, thumb: !prev.thumb }))}
                          >
                            <div className={`p-1.5 rounded-lg ${config.bgType === 'thumb' ? 'bg-[var(--layout-accent-color)] text-white' : 'bg-[var(--layout-accent-color)]/10 text-[var(--layout-accent-color)]'}`}>
                              <Shapes size={16} />
                            </div>
                            <h4 className="text-xs font-bold uppercase tracking-wider">3. Fundo Thumb Programa</h4>
                            {openSections.thumb ? <ChevronUp size={14} className="opacity-40 ml-auto" /> : <ChevronDown size={14} className="opacity-40 ml-auto" />}
                          </button>
                          <div className="pl-4 border-l border-black/5 ml-2">
                            <Switch 
                              checked={config.bgType === 'thumb'} 
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setConfig(c => ({ ...c, bgType: 'thumb', useProgramThumbAsBg: true }));
                                } else {
                                  setConfig(c => ({ ...c, bgType: 'none' }));
                                }
                              }}
                              className="data-[state=checked]:bg-[var(--layout-accent-color)]"
                            />
                          </div>
                        </div>
                        
                        {openSections.thumb && config.bgType === 'thumb' && (
                          <div className="space-y-3 pt-2 animate-in slide-in-from-top-2 duration-300 border-t border-black/5 mt-1">
                            <div className="flex flex-col gap-3">
                              <div className="flex items-center justify-between">
                                <Label className="text-[10px] font-bold uppercase opacity-60">Ajustar Alinhamento</Label>
                                <span className="text-[10px] font-mono opacity-60">{config.programThumbPosition || "50%"}</span>
                              </div>
                              <div className="flex items-center gap-3 px-1">
                                <span className="text-[10px] opacity-50 uppercase font-extrabold">Esq</span>
                                <Slider 
                                  value={[(() => {
                                    const pos = config.programThumbPosition || "50%";
                                    const val = parseInt(pos);
                                    return isNaN(val) ? 50 : val;
                                  })()]} 
                                  min={0} 
                                  max={100} 
                                  step={1} 
                                  onValueChange={([v]) => setConfig(c => ({ ...c, programThumbPosition: `${v}%` }))}
                                  className="flex-1"
                                  style={{ "--primary": "var(--layout-accent-color)" } as any}
                                />
                                <span className="text-[10px] opacity-50 uppercase font-extrabold">Dir</span>
                              </div>
                            </div>

                            <div className="space-y-3 p-3 rounded-lg bg-black/5 border border-black/5 mt-2">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="p-1 rounded bg-[var(--layout-accent-color)]/10 text-[var(--layout-accent-color)]">
                                    <Palette size={14} />
                                  </div>
                                  <Label className="text-[10px] font-bold uppercase">Overlay por cima da Thumb</Label>
                                </div>
                                <Switch 
                                  checked={!!config.thumbOverlayEnabled} 
                                  onCheckedChange={v => setConfig(c => ({ ...c, thumbOverlayEnabled: v }))} 
                                  className="data-[state=checked]:bg-[var(--layout-accent-color)]"
                                />
                              </div>

                              {config.thumbOverlayEnabled && (
                                <div className="space-y-3 pt-2 animate-in fade-in duration-300">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                      <Label className="text-[10px] opacity-60 font-bold">Cor do Overlay</Label>
                                      <div className="flex items-center gap-2">
                                        <div 
                                          className="w-8 h-8 rounded border shadow-sm shrink-0" 
                                          style={{ background: config.thumbOverlayColor || "#000000" }} 
                                        />
                                        <Input 
                                          type="text"
                                          value={config.thumbOverlayColor || "#000000"}
                                          onChange={e => setConfig(c => ({ ...c, thumbOverlayColor: e.target.value }))}
                                          className="h-8 text-[10px] font-mono"
                                        />
                                      </div>
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label className="text-[10px] opacity-60 font-bold">Opacidade ({config.thumbOverlayOpacity ?? 60}%)</Label>
                                      <Slider 
                                        value={[config.thumbOverlayOpacity ?? 60]} 
                                        min={0} 
                                        max={100} 
                                        step={1} 
                                        onValueChange={([v]) => setConfig(c => ({ ...c, thumbOverlayOpacity: v }))}
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 4 - Imagem do Artista */}
                      <div className={`flex flex-col gap-3 p-4 rounded-xl border-2 transition-all ${config.home.showArtistImage ? 'bg-[var(--layout-accent-color)]/10 border-[var(--layout-accent-color)]/60' : 'bg-white/40 border-[var(--layout-accent-color)]/60'}`}>
                        <div className="flex items-center justify-between">
                          <button 
                            className="flex items-center gap-2 flex-1 text-left"
                            onClick={() => setOpenSections(prev => ({ ...prev, artist: !prev.artist }))}
                          >
                            <div className={`p-1.5 rounded-lg ${config.home.showArtistImage ? 'bg-[var(--layout-accent-color)] text-white' : 'bg-[var(--layout-accent-color)]/10 text-[var(--layout-accent-color)]'}`}>
                              <Music size={16} />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold uppercase tracking-wider">4. Imagem do Artista</h4>
                              <p className="text-[10px] opacity-50">Exibir capa do álbum (Deezer)</p>
                            </div>
                            {openSections.artist ? <ChevronUp size={14} className="opacity-40 ml-auto" /> : <ChevronDown size={14} className="opacity-40 ml-auto" />}
                          </button>
                          <div className="pl-4 border-l border-black/5 ml-2">
                            <Switch 
                              checked={!!config.home.showArtistImage} 
                              onCheckedChange={v => updateHome({ showArtistImage: v })} 
                              className="data-[state=checked]:bg-[var(--layout-accent-color)]"
                            />
                          </div>
                        </div>

                        {openSections.artist && config.home.showArtistImage && (
                          <div className="pt-3 border-t border-[var(--layout-accent-color)]/20 space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="space-y-3 p-3 rounded-lg bg-black/5 border border-black/5">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="p-1 rounded bg-[var(--layout-accent-color)]/10 text-[var(--layout-accent-color)]">
                                    <Palette size={14} />
                                  </div>
                                  <Label className="text-[10px] font-bold uppercase">Overlay por cima da capa</Label>
                                </div>
                                <Switch 
                                  checked={!!config.home.artistOverlayEnabled} 
                                  onCheckedChange={v => updateHome({ artistOverlayEnabled: v })} 
                                  className="data-[state=checked]:bg-[var(--layout-accent-color)]"
                                />
                              </div>

                              {config.home.artistOverlayEnabled && (
                                <div className="space-y-3 pt-2 animate-in fade-in duration-300">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="space-y-1.5">
                                      <Label className="text-[10px] opacity-60 font-bold">Cor do Overlay</Label>
                                      <div className="flex items-center gap-2">
                                        <div 
                                          className="w-8 h-8 rounded border shadow-sm shrink-0" 
                                          style={{ background: config.home.artistOverlayColor || "#000000" }} 
                                        />
                                        <Input 
                                          type="text"
                                          value={config.home.artistOverlayColor || "#000000"}
                                          onChange={e => updateHome({ artistOverlayColor: e.target.value })}
                                          className="h-8 text-[10px] font-mono"
                                        />
                                      </div>
                                    </div>
                                    <div className="space-y-1.5">
                                      <Label className="text-[10px] opacity-60 font-bold">Opacidade ({config.home.artistOverlayOpacity ?? 60}%)</Label>
                                      <Slider 
                                        value={[config.home.artistOverlayOpacity ?? 60]} 
                                        min={0} 
                                        max={100} 
                                        step={1} 
                                        onValueChange={([v]) => updateHome({ artistOverlayOpacity: v })}
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 mb-1">
                              <div className="p-1 rounded bg-[var(--layout-accent-color)]/10 text-[var(--layout-accent-color)]">
                                <EyeOff size={14} />
                              </div>
                              <Label className="text-[10px] font-bold uppercase">Filtro de Exceções</Label>
                            </div>
                            <div className="pl-7 space-y-2">
                              <p className="text-[10px] leading-relaxed opacity-60">
                                Força o degradê padrão quando estas palavras aparecem (ex: breaks).
                              </p>
                              <ExceptionWordsInput value={config.home.exceptionWords || ""} onSave={v => updateHome({ exceptionWords: v })} />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 5 - Alternar Automático */}
                      <div className={`flex flex-col gap-3 p-4 rounded-xl border-2 transition-all ${config.bgAlternateMode ? 'bg-[var(--layout-accent-color)]/10 border-[var(--layout-accent-color)]/60' : 'bg-white/40 border-[var(--layout-accent-color)]/60'}`}>
                        <div className="flex items-center justify-between">
                          <button 
                            className="flex items-center gap-2 flex-1 text-left"
                            onClick={() => setOpenSections(prev => ({ ...prev, alternate: !prev.alternate }))}
                          >
                            <div className={`p-1.5 rounded-lg ${config.bgAlternateMode ? 'bg-[var(--layout-accent-color)] text-white' : 'bg-[var(--layout-accent-color)]/10 text-[var(--layout-accent-color)]'}`}>
                              <RefreshCw size={16} />
                            </div>
                            <div>
                              <h4 className="text-xs font-bold uppercase tracking-wider">5. Alternância Automática</h4>
                              <p className="text-[10px] opacity-50">Alternar entre as opções ativas acima</p>
                            </div>
                            {openSections.alternate ? <ChevronUp size={14} className="opacity-40 ml-auto" /> : <ChevronDown size={14} className="opacity-40 ml-auto" />}
                          </button>
                          <div className="pl-4 border-l border-black/5 ml-2">
                            <Switch 
                              checked={!!config.bgAlternateMode} 
                              onCheckedChange={v => setConfig(c => ({ ...c, bgAlternateMode: v }))} 
                              className="data-[state=checked]:bg-[var(--layout-accent-color)]"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* ═══ Weather ═══ */}
              <TabsContent value="weather" className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Ativar Previsão do Tempo</Label>
                  <Switch checked={config.weather.enabled} onCheckedChange={v => updateWeather({ enabled: v })} />
                </div>

                {config.weather.enabled && (
                  <div className="mt-4">
                    <div className="flex gap-1 rounded-lg p-1 mt-4" style={{ background: subTabBg }}>
                      {[
                        { key: "today", label: "Previsão do Tempo", icon: <Sun size={13} /> },
                        { key: "satellite", label: "Satélite", icon: <Satellite size={13} /> },
                      ].map(t => (
                        <button
                          key={t.key}
                          onClick={() => {
                            handleWeatherSubTabChange(t.key);
                            if (t.key === "satellite" && !config.weather.showSatellite) {
                              updateWeather({ showSatellite: true });
                            }
                          }}
                          className="flex-1 flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all"
                          style={{
                            background: weatherSubTab === t.key ? subTabActive : "transparent",
                            color: weatherSubTab === t.key ? "var(--layout-header-text, #fff)" : textColor,
                          }}
                        >
                          {t.icon} {t.label}
                        </button>
                      ))}
                    </div>

                    {weatherSubTab === "today" && (
                      <div className="space-y-4">
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <Label className="text-sm">Ativar Informações do Tempo</Label>
                            <div className="flex gap-2">
                              <div className="flex items-center gap-1">
                                <span className="text-[10px]" style={{ color: mutedText }}>Hoje</span>
                                <Switch checked={config.weather.showCurrent} onCheckedChange={v => updateWeather({ showCurrent: v })} />
                              </div>
                              <div className="flex items-center gap-1">
                                <span className="text-[10px]" style={{ color: mutedText }}>3 Dias</span>
                                <Switch checked={config.weather.showForecast3Days} onCheckedChange={v => updateWeather({ showForecast3Days: v })} />
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col gap-2">
                            <Label className="text-xs mb-1 block" style={{ color: mutedText }}>Cidade (ou use a cidade principal)</Label>
                            <div className="flex gap-2">
                              <Input 
                                placeholder={config.city || "Ex: São Paulo"} 
                                value={config.weather.city} 
                                onChange={e => updateWeather({ city: e.target.value })} 
                                className="text-sm h-8" 
                                style={{ color: textColor, background: "var(--layout-page-bg, #ffffff)" }} 
                              />
                              <Button 
                                size="sm" 
                                className="h-8 px-2 text-[10px] font-bold uppercase tracking-tight bg-[var(--layout-accent-color)] hover:bg-[var(--layout-accent-color)]/90 text-white"
                                onClick={() => {
                                  if (!config.weather.city || !weatherCoords) return;
                                  const favs = config.weather.favorites || [];
                                  if (favs.some(f => f.name === config.weather.city)) return;
                                  updateWeather({ 
                                    favorites: [...favs, { name: config.weather.city, lat: weatherCoords.lat, lon: weatherCoords.lon }] 
                                  });
                                }}
                              >
                                <Star size={12} className="mr-1" /> Favoritar
                              </Button>
                            </div>
                            
                            {/* Weather favorites chips */}
                            {config.weather.favorites && config.weather.favorites.length > 0 && (
                              <div className="flex flex-wrap gap-1.5 mt-1 pt-2 border-t border-black/5">
                                {config.weather.favorites.map((f, idx) => (
                                  <div 
                                    key={idx}
                                    className="flex items-center gap-1.5 rounded-full px-2 py-1 text-[10px] font-bold group cursor-pointer transition-all hover:scale-105"
                                    style={{ 
                                      background: config.weather.city === f.name ? "var(--layout-accent-color)" : subTabBg,
                                      color: config.weather.city === f.name ? "#fff" : textColor,
                                      border: "1px solid rgba(0,0,0,0.05)"
                                    }}
                                    onClick={() => updateWeather({ city: f.name })}
                                  >
                                    <MapPin size={10} />
                                    <span>{f.name}</span>
                                    <button 
                                      className="hover:text-red-500 opacity-40 hover:opacity-100 transition-all ml-0.5"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        updateWeather({ 
                                          favorites: config.weather.favorites?.filter(fav => fav.name !== f.name) 
                                        });
                                      }}
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {weatherLoading && (
                          <div className="flex items-center gap-2 text-xs" style={{ color: mutedText }}>
                            <Loader2 size={14} className="animate-spin" /> Carregando dados...
                          </div>
                        )}

                        {!weatherLoading && liveWeather && (
                          <div className="space-y-3">
                            {config.weather.showForecast3Days && (
                              <div className="space-y-2">
                                <Label className="text-[10px] uppercase tracking-wider font-bold opacity-50 block px-1">Próximos Dias</Label>
                                <div className="grid grid-cols-1 gap-2">
                                  {liveWeather.daily.slice(1, 4).map((day, i) => {
                                    const d = new Date(day.date + "T12:00:00");
                                    const dayName = d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });
                                    return (
                                      <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2 border" style={{ background: subTabBg, borderColor: "rgba(255,255,255,0.05)" }}>
                                        <span className="text-xl">{getWIcon(day.code)}</span>
                                        <div className="flex-1">
                                          <div className="text-xs font-medium capitalize">{dayName}</div>
                                          <div className="text-[10px]" style={{ color: mutedText }}>{getWLabel(day.code)}</div>
                                        </div>
                                        <div className="text-right text-xs">
                                          <span className="font-bold">{day.max}°</span>
                                          <span style={{ color: mutedText }}> / {day.min}°</span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                        {!weatherLoading && !liveWeather && weatherCity && (
                          <p className="text-xs" style={{ color: mutedText }}>Cidade não encontrada. Verifique o nome.</p>
                        )}
                      </div>
                    )}

                    {weatherSubTab === "satellite" && (
                      <div className="space-y-3">
                        <p className="text-xs" style={{ color: mutedText }}>
                          Exibe imagens de satélite meteorológico da região configurada.
                        </p>
                        <div className="flex items-center justify-between p-2 rounded-lg border border-dashed" style={{ borderColor: "rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.2)" }}>
                          <Label className="text-sm cursor-pointer" htmlFor="show-satellite-switch">Exibir imagens de satélite</Label>
                          <Switch id="show-satellite-switch" checked={config.weather.showSatellite} onCheckedChange={v => updateWeather({ showSatellite: v })} />
                        </div>
                        <div>
                          <Label className="text-xs mb-1 block" style={{ color: mutedText }}>Cidade para satélite</Label>
                          <Input placeholder="Ex: São Paulo" value={config.weather.city} onChange={e => updateWeather({ city: e.target.value })} className="text-sm" style={{ color: textColor, background: "var(--layout-page-bg, #ffffff)" }} />
                        </div>
                        {config.weather.showSatellite && weatherCoords && (
                          <div className="rounded-lg overflow-hidden border border-border/10 h-[250px]" style={{ background: subTabBg }}>
                            <SatelliteMap 
                              lat={config.weather.lat ?? weatherCoords.lat} 
                              lon={config.weather.lon ?? weatherCoords.lon} 
                              zoom={config.weather.zoom} 
                              interactive
                              onMove={(lat, lon, z) => updateWeather({ lat, lon, zoom: z })}
                            />
                          </div>
                        )}
                        {config.weather.showSatellite && !weatherCoords && (
                          <p className="text-xs text-center py-4" style={{ color: mutedText }}>
                            {weatherCity ? "Buscando coordenadas..." : "Defina uma cidade para ver o satélite."}
                          </p>
                        )}
                      </div>
                    )}

                    <BgImageUpload value={config.weather.bgImage} onChange={v => updateWeather({ bgImage: v })} mutedText={mutedText} userId={uid} category="weather" />
                  </div>
                )}
              </TabsContent>

              {/* ═══ Traffic ═══ */}
              <TabsContent value="traffic" className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Ativar Trânsito</Label>
                  <Switch checked={config.traffic.enabled} onCheckedChange={v => updateTraffic({ enabled: v })} />
                </div>
                {config.traffic.enabled && (
                  <>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <div className="flex-1 space-y-1 relative">
                          <Label className="text-[10px] opacity-60 font-bold uppercase">Cidade</Label>
                          <div className="flex gap-2">
                            <div className="relative flex-1">
                              <Input
                                placeholder="Nome da cidade..."
                                value={trafficSearchCity}
                                onChange={e => handleTrafficCityInput(e.target.value)}
                                onKeyDown={e => e.key === "Enter" && handleTrafficSearch()}
                                className="text-sm h-9 flex-1 pr-8"
                                style={{ color: textColor, background: "var(--layout-page-bg, #ffffff)" }}
                              />
                              {isSearchingCity && (
                                <div className="absolute right-2 top-2.5">
                                  <Loader2 size={14} className="animate-spin opacity-40" />
                                </div>
                              )}
                            </div>
                            <Button size="sm" onClick={handleTrafficSearch} className="h-9 px-3 gap-1 text-xs" style={{ background: "var(--layout-header-bg, #0d0446)", color: "var(--layout-header-text, #fff)" }}>
                              <Search size={14} /> Buscar
                            </Button>
                          </div>
                          {trafficCitySuggestions.length > 0 && (
                            <div 
                              className="absolute z-[60] w-full top-[calc(100%+4px)] rounded-lg border shadow-xl overflow-hidden max-h-48 overflow-y-auto"
                              style={{ background: "var(--layout-page-bg, #ffffff)", borderColor: "var(--layout-border-color, #333)" }}
                            >
                              {trafficCitySuggestions.map((city, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => selectTrafficCity(city)}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-black/5 transition-colors border-b last:border-0"
                                  style={{ borderBottomColor: "rgba(0,0,0,0.05)", color: textColor }}
                                >
                                  <div className="font-bold">{city.name}</div>
                                  <div className="opacity-60 text-[10px] truncate">{city.display_name || (city.admin1 ? `${city.admin1}, ${city.country}` : city.country)}</div>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="space-y-1 relative">
                        <Label className="text-[10px] opacity-60 font-bold uppercase">Endereço específico</Label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              placeholder="Buscar endereço..."
                              value={trafficSearchAddress}
                              onChange={e => searchAddress(e.target.value)}
                              className="text-sm h-9 pr-8"
                              style={{ color: textColor, background: "var(--layout-page-bg, #ffffff)" }}
                            />
                            {isSearchingAddress && (
                              <div className="absolute right-2 top-2.5">
                                <Loader2 size={14} className="animate-spin opacity-40" />
                              </div>
                            )}
                          </div>
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={addTrafficPoint} 
                            className="h-9 gap-1 text-xs" 
                            title="Marcar este ponto no mapa"
                            style={{ borderColor: "var(--layout-border-color, #333)", color: textColor }}
                          >
                            <MapPin size={14} /> Marcar
                          </Button>
                        </div>
                        
                        {addressSuggestions.length > 0 && (
                          <div 
                            className="absolute z-50 w-full top-[calc(100%+4px)] rounded-lg border shadow-xl overflow-hidden max-h-48 overflow-y-auto"
                            style={{ background: "var(--layout-page-bg, #ffffff)", borderColor: "var(--layout-border-color, #333)" }}
                          >
                            {addressSuggestions.map((addr, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => selectAddress(addr)}
                                  className="w-full text-left px-3 py-2 text-xs hover:bg-black/5 transition-colors border-b last:border-0"
                                  style={{ borderBottomColor: "rgba(0,0,0,0.05)", color: textColor }}
                                >
                                  <div className="font-bold">{addr.name}</div>
                                  <div className="opacity-60 text-[10px] truncate">{addr.display_name || (addr.admin1 ? `${addr.admin1}, ${addr.country}` : addr.country)}</div>
                                </button>
                              ))}
                            </div>
                          )}
                      </div>
                    </div>

                    <div className="rounded-lg p-3 text-xs text-center" style={{ background: subTabBg, color: mutedText }}>
                      <Car size={16} className="mx-auto mb-1 opacity-60" />
                      O mapa de trânsito é exibido no Preview ao lado →
                    </div>

                    {/* Live traffic incidents (HERE API) */}
                    <div
                      className="rounded-lg border p-3 space-y-2"
                      style={{ background: subTabBg, borderColor: "var(--layout-border-color, rgba(0,0,0,0.08))", color: textColor }}
                    >
                      <div className="flex items-center justify-between">
                        <Label className="text-[10px] opacity-70 font-bold uppercase flex items-center gap-1.5">
                          <Car size={12} /> Trânsito ao vivo · {trafficCity || "—"}
                        </Label>
                        <div className="flex items-center gap-2">
                          {trafficJamsUpdatedAt && (
                            <span className="text-[9px] opacity-50 font-mono">
                              {new Date(trafficJamsUpdatedAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          )}
                          {trafficJamsLoading && <Loader2 size={12} className="animate-spin opacity-60" />}
                        </div>
                      </div>

                      {!config.traffic.enabled || !trafficCity ? (
                        <div className="text-[11px] opacity-60 text-center py-2">Ative o trânsito e defina uma cidade.</div>
                      ) : trafficJams.length === 0 ? (
                        <div className="text-[11px] opacity-70 text-center py-2">
                          {trafficJamsLoading ? "Buscando incidentes…" : "Trânsito tá de boa agora · use cinto de segurança!"}
                        </div>
                      ) : (
                        <>
                          {(() => {
                            const j = trafficJams[trafficJamIdx] || trafficJams[0];
                            const delayMin = Math.round((j?.delaySec || 0) / 60);
                            const lvlColor = j?.level >= 4 ? "#ff2d2d" : j?.level >= 3 ? "#ff8a1f" : "#ffd23d";
                            return (
                              <div className="flex items-start gap-2">
                                <div className="w-1.5 rounded-full self-stretch" style={{ background: lvlColor, minHeight: 32 }} />
                                <div className="flex-1 min-w-0">
                                  <div className="text-xs font-bold truncate">{j?.street || j?.title || "Incidente"}</div>
                                  {j?.description && <div className="text-[10px] opacity-70 truncate">{j.description}</div>}
                                  <div className="text-[10px] opacity-60 mt-0.5">
                                    {delayMin > 0 ? `+${delayMin} min de atraso` : "Ocorrência ativa"}
                                    {typeof j?.lengthKm === "number" && ` · ${j.lengthKm.toFixed(1)} km`}
                                  </div>
                                </div>
                                <span className="text-[9px] font-mono opacity-50 flex-shrink-0">{trafficJamIdx + 1}/{trafficJams.length}</span>
                              </div>
                            );
                          })()}
                          {trafficJams.length > 1 && (
                            <div className="flex gap-1 justify-center pt-1">
                              {trafficJams.slice(0, 8).map((_, i) => (
                                <span
                                  key={i}
                                  className="rounded-full transition-all"
                                  style={{
                                    width: i === trafficJamIdx ? 12 : 4,
                                    height: 4,
                                    background: i === trafficJamIdx ? "var(--layout-accent-color, #3b82f6)" : "rgba(0,0,0,0.2)",
                                  }}
                                />
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>



                    {/* Lat / Lon / Zoom controls */}
                    {trafficCoords && (
                      <div className="space-y-2 mt-2">
                        <Label className="text-xs font-medium" style={{ color: mutedText }}>Coordenadas e Zoom</Label>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <Label className="text-[10px] opacity-60">Latitude</Label>
                            <Input
                              type="number"
                              step="0.001"
                              value={config.traffic.lat ?? trafficCoords.lat}
                              onChange={e => {
                                const v = parseFloat(e.target.value);
                                if (!isNaN(v)) updateTraffic({ lat: v });
                              }}
                              className="text-xs h-8"
                              style={{ color: textColor, background: "var(--layout-page-bg, #ffffff)" }}
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] opacity-60">Longitude</Label>
                            <Input
                              type="number"
                              step="0.001"
                              value={config.traffic.lon ?? trafficCoords.lon}
                              onChange={e => {
                                const v = parseFloat(e.target.value);
                                if (!isNaN(v)) updateTraffic({ lon: v });
                              }}
                              className="text-xs h-8"
                              style={{ color: textColor, background: "var(--layout-page-bg, #ffffff)" }}
                            />
                          </div>
                          <div>
                            <Label className="text-[10px] opacity-60">Zoom</Label>
                            <Input
                              type="number"
                              min={3}
                              max={18}
                              value={config.traffic.zoom}
                              onChange={e => {
                                const v = parseInt(e.target.value);
                                if (!isNaN(v) && v >= 3 && v <= 18) updateTraffic({ zoom: v });
                              }}
                              className="text-xs h-8"
                              style={{ color: textColor, background: "var(--layout-page-bg, #ffffff)" }}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0 text-xs font-bold"
                            style={{ borderColor: "var(--layout-border-color, #333)", color: textColor }}
                            disabled={config.traffic.zoom <= 3}
                            onClick={() => updateTraffic({ zoom: Math.max(3, config.traffic.zoom - 1) })}
                          >
                            −
                          </Button>
                          <input
                            type="range"
                            min={3}
                            max={18}
                            value={config.traffic.zoom}
                            onChange={e => updateTraffic({ zoom: parseInt(e.target.value) })}
                            className="flex-1 h-1.5 appearance-none rounded-full cursor-pointer"
                            style={{ accentColor: "var(--layout-accent-color, #3b82f6)" }}
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0 text-xs font-bold"
                            style={{ borderColor: "var(--layout-border-color, #333)", color: textColor }}
                            disabled={config.traffic.zoom >= 18}
                            onClick={() => updateTraffic({ zoom: Math.min(18, config.traffic.zoom + 1) })}
                          >
                            +
                          </Button>
                          <span className="text-[10px] font-mono opacity-50" style={{ color: textColor }}>{config.traffic.zoom}x</span>
                        </div>
                      </div>
                    )}

                    {(config.traffic.points.length > 0 || (config.traffic.favorites && config.traffic.favorites.length > 0)) && (
                      <div className="space-y-4 mt-2">
                        {config.traffic.favorites && config.traffic.favorites.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-xs font-medium flex items-center gap-1.5" style={{ color: mutedText }}>
                              <Star size={12} className="fill-yellow-500 text-yellow-500" /> Favoritos
                            </Label>
                            <div className="grid grid-cols-1 gap-2">
                              {config.traffic.favorites.map(p => (
                                <div 
                                  key={p.id} 
                                  className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs group transition-colors hover:bg-black/10 cursor-pointer" 
                                  style={{ background: subTabBg }}
                                  onClick={() => loadFavoritePoint(p)}
                                >
                                  <MapPin size={12} className="text-yellow-500" />
                                  <span className="flex-1 font-medium truncate">{p.label}</span>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFavoritePoint(p);
                                    }} 
                                    className="opacity-40 hover:opacity-100 transition-all p-1"
                                  >
                                    <Star size={14} className="fill-yellow-500 text-yellow-500" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {config.traffic.points.length > 0 && (
                          <div className="space-y-2">
                            <Label className="text-xs font-medium" style={{ color: mutedText }}>Pontos atuais</Label>
                            {config.traffic.points.map(p => (
                              <div 
                                key={p.id} 
                                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs group transition-colors hover:bg-black/10 cursor-pointer" 
                                style={{ background: subTabBg }}
                                onClick={() => goToTrafficPoint(p)}
                              >
                                <MapPin size={12} className="text-[var(--layout-accent-color)]" />
                                <span className="flex-1 font-medium truncate">{p.label}</span>
                                <div className="flex items-center gap-1">
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleFavoritePoint(p);
                                    }} 
                                    className="opacity-40 hover:opacity-100 transition-all p-1"
                                    title="Alternar favorito"
                                  >
                                    <Star size={14} className={(config.traffic.favorites || []).some(f => f.id === p.id) ? "fill-yellow-500 text-yellow-500" : ""} />
                                  </button>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeTrafficPoint(p.id);
                                    }} 
                                    className="opacity-40 hover:opacity-100 hover:text-red-500 transition-all p-1"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    
                  </>
                )}
              </TabsContent>

              {/* ═══ Currency ═══ */}
              <TabsContent value="currency" className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Ativar Cotações</Label>
                  <Switch checked={config.currency.enabled} onCheckedChange={v => updateCurrency({ enabled: v })} />
                </div>
                {config.currency.enabled && (
                  <div className="space-y-3">
                    {/* Sub-tabs: Moedas / Bolsas */}
                    <div className="flex gap-1 rounded-lg p-1" style={{ background: subTabBg }}>
                      {([{ key: "moedas", label: "Moedas", icon: DollarSign }, { key: "bolsas", label: "Bolsas", icon: TrendingUp }] as const).map(t => (
                        <button
                          key={t.key}
                          onClick={() => handleCurrencySubTabChange(t.key as "moedas" | "bolsas")}
                          className="flex-1 flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium transition-all"
                          style={{
                            background: currencySubTab === t.key ? subTabActive : "transparent",
                            color: currencySubTab === t.key ? "var(--layout-header-text, #fff)" : textColor,
                          }}
                        >
                          <t.icon size={12} /> {t.label}
                        </button>
                      ))}
                    </div>

                    {currencySubTab === "moedas" && (
                      <>
                        <p className="text-xs" style={{ color: mutedText }}>Selecione as moedas para exibir:</p>
                        {CURRENCY_OPTIONS.map(opt => (
                          <label key={opt.value} className="flex items-center gap-3 rounded-lg px-3 py-2 cursor-pointer text-sm hover:bg-black/5 transition-colors" style={{ background: config.currency.currencies.includes(opt.value) ? "color-mix(in srgb, var(--layout-header-bg, #0d0446) 10%, transparent)" : "transparent" }}>
                            <input type="checkbox" checked={config.currency.currencies.includes(opt.value)} onChange={() => toggleCurrency(opt.value)} className="accent-[var(--layout-header-bg)]" />
                            <DollarSign size={14} style={{ color: mutedText }} />
                            {opt.label}
                          </label>
                        ))}
                      </>
                    )}

                    {currencySubTab === "bolsas" && (
                      <div className="space-y-2">
                        <p className="text-xs" style={{ color: mutedText }}>Principais bolsas de valores em tempo real:</p>
                        {stocksLoading && !liveStocks.length ? (
                          <div className="flex items-center gap-2 text-xs" style={{ color: mutedText }}><Loader2 size={14} className="animate-spin" /> Carregando bolsas...</div>
                        ) : liveStocks.length > 0 ? (
                          liveStocks.map(s => (
                            <div key={s.symbol} className="flex items-center justify-between rounded-lg px-3 py-2 text-sm" style={{ background: subTabBg }}>
                              <span className="flex items-center gap-2 font-medium">
                                <span>{s.flag}</span> {s.name}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <span className="font-bold">{s.value}</span>
                                <span className="font-semibold text-xs" style={{ color: s.direction === "up" ? "#22c55e" : s.direction === "down" ? "#ef4444" : mutedText }}>{s.change}</span>
                                {s.direction === "up" && <TrendingUp size={14} style={{ color: "#22c55e" }} />}
                                {s.direction === "down" && <TrendingDown size={14} style={{ color: "#ef4444" }} />}
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs opacity-60">Dados indisponíveis no momento</p>
                        )}
                      </div>
                    )}

                    <BgImageUpload value={config.currency.bgImage} onChange={v => updateCurrency({ bgImage: v })} mutedText={mutedText} userId={uid} category="currency" />
                  </div>
                )}
              </TabsContent>

              <TabsContent value="enquete" className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Exibir Enquete no Cenário</Label>
                  <Switch 
                    checked={config.enquete?.enabled} 
                    onCheckedChange={v => setConfig(prev => ({ ...prev, enquete: { ...prev.enquete, enabled: v } }))} 
                  />
                </div>
                {config.enquete?.enabled && (
                  <div className="space-y-4">
                    <p className="text-xs" style={{ color: mutedText }}>
                      A enquete configurada será exibida automaticamente quando estiver dentro do horário agendado.
                    </p>
                    
                    {enquetes.length > 0 ? (
                      <div className="space-y-2">
                        <Label className="text-[10px] uppercase tracking-wider font-bold" style={{ color: mutedText }}>Enquetes Agendadas</Label>
                        <div className="grid gap-2">
                          {enquetes.slice(0, 5).map(e => {
                            const today = new Date().toISOString().split('T')[0];
                            const isToday = e.data_enquete === today;
                            return (
                              <div key={e.id} className="p-3 rounded-xl border flex flex-col gap-1 transition-all" 
                                   style={{ 
                                     background: isToday ? "rgba(0,191,240,0.05)" : "white",
                                     borderColor: isToday ? "#00BFF0" : "rgba(0,0,0,0.05)"
                                   }}>
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" 
                                        style={{ 
                                          background: isToday ? "#00BFF0" : "#64748B",
                                          color: "white" 
                                        }}>
                                    {isToday ? "HOJE" : e.data_enquete.split('-').reverse().join('/')}
                                  </span>
                                  <span className="text-[10px] font-medium opacity-60">{e.horario_inicio} - {e.horario_fim}</span>
                                </div>
                                <p className="text-sm font-bold mt-1">{e.pergunta}</p>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 bg-black/5 rounded-xl border border-dashed border-black/10">
                        <Tag className="mx-auto mb-2 opacity-20" size={32} />
                        <p className="text-xs opacity-50">Nenhuma enquete agendada</p>
                      </div>
                    )}

                    <BgImageUpload 
                      value={config.enquete?.bgImage || ""} 
                      onChange={v => setConfig(prev => ({ ...prev, enquete: { ...prev.enquete, bgImage: v } }))} 
                      mutedText={mutedText} 
                      userId={uid} 
                      category="enquete" 
                    />
                  </div>
                )}
              </TabsContent>

              {/* ═══ Chat ═══ */}
              <TabsContent value="chat" className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-medium">Habilitar Chat YouTube Live</Label>
                    <p className="text-[10px]" style={{ color: mutedText }}>
                      Identifica automaticamente se você tem uma live ativa no seu canal.
                    </p>
                  </div>
                  <Switch checked={config.chat.enabled} onCheckedChange={v => updateChat({ enabled: v })} />
                </div>
                {config.chat.enabled && (
                  <div className="space-y-3">
                    <BgImageUpload value={config.chat.bgImage} onChange={v => updateChat({ bgImage: v })} mutedText={mutedText} userId={uid} category="chat" />
                  </div>
                )}
                
                {config.chat.enabled && chatMessages.length > 0 && (
                  <div className="space-y-2 mt-4 pt-4 border-t" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333) 10%, transparent)" }}>
                    <div className="flex items-center justify-between">
                      <Label className="text-[10px] uppercase tracking-wider font-bold" style={{ color: mutedText }}>Mensagens recentes</Label>
                      {isUpdatingChat && <Loader2 size={10} className="animate-spin" style={{ color: accentColor }} />}
                    </div>
                    <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1 custom-scrollbar">
                      {chatMessages.slice().reverse().map((m, i) => (
                        <div key={i} className="p-2 rounded-lg text-[11px] leading-relaxed animate-fade-in" style={{ background: "color-mix(in srgb, var(--layout-page-text, #000) 5%, transparent)", color: textColor }}>
                          <span className="font-bold mr-1" style={{ color: accentColor }}>{m.user}:</span>
                          {m.text}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="colors" className="space-y-5 animate-in fade-in-50 duration-300">
                <div className="flex flex-col gap-5">
                                    {/* Cores dos Elementos do Preview */}
                                    {(() => {
                                      const colorFields: { key: keyof HomeConfig; label: string; def: string }[] = [
                                        { key: "colorButtonBgOff", label: "Fundo do botão desligado (inativo)", def: "rgba(0,0,0,0.8)" },
                                        { key: "colorButtonBgOn",  label: "Fundo do botão ativo",             def: "rgba(0,191,240,0.85)" },
                                        { key: "colorButtonOff",   label: "Ícone do botão desligado (inativo)", def: "rgba(255,255,255,0.7)" },
                                        { key: "colorButtonOn",    label: "Ícone do botão ativo",             def: "#FFFFFF" },
                                        { key: "colorClock",       label: "Texto — Hora",                   def: "#FFFFFF" },
                                        { key: "colorDate",        label: "Texto — Data",                   def: "#00BFF0" },
                                        { key: "colorMusicName",   label: "Texto — Nome da música",         def: "#FFFFFF" },
                                        { key: "colorMusicTitle",  label: "Texto — Título da música",       def: "#00BFF0" },
                                        { key: "colorASeguirLabel", label: 'Texto — "a seguir"',            def: "#00BFF0" },
                                        { key: "colorNextProgram",  label: "Texto — Programa a seguir",        def: "#FFFFFF" },
                                        { key: "colorProgressBar",  label: "Barra de progresso do programa",   def: "#00BFF0" },
                                      ];
                                      const normalizeHex = (v: string) => {
                                        const s = v?.trim?.() || "";
                                        if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toUpperCase();
                                        if (/^#[0-9a-fA-F]{3}$/.test(s)) return ("#" + s.slice(1).split("").map(c => c + c).join("")).toUpperCase();
                                        const m = s.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
                                        if (m) {
                                          const toHex = (n: string) => Math.max(0, Math.min(255, parseInt(n, 10))).toString(16).padStart(2, "0");
                                          return ("#" + toHex(m[1]) + toHex(m[2]) + toHex(m[3])).toUpperCase();
                                        }
                                        return null;
                                      };
                  
                                      // WCAG 2.1 relative luminance + contrast ratio
                                      const hexToRgb = (hex: string): [number, number, number] | null => {
                                        const n = normalizeHex(hex);
                                        if (!n) return null;
                                        return [parseInt(n.slice(1,3),16), parseInt(n.slice(3,5),16), parseInt(n.slice(5,7),16)];
                                      };
                                      const relLum = (rgb: [number,number,number]) => {
                                        const c = rgb.map(v => {
                                          const s = v/255;
                                          return s <= 0.03928 ? s/12.92 : Math.pow((s+0.055)/1.055, 2.4);
                                        });
                                        return 0.2126*c[0] + 0.7152*c[1] + 0.0722*c[2];
                                      };
                                      const contrastRatio = (a: string, b: string): number | null => {
                                        const ra = hexToRgb(a); const rb = hexToRgb(b);
                                        if (!ra || !rb) return null;
                                        const la = relLum(ra); const lb = relLum(rb);
                                        const light = Math.max(la, lb); const dark = Math.min(la, lb);
                                        return (light + 0.05) / (dark + 0.05);
                                      };
                                      const pairFor = (key: string) => {
                                        if (key === "colorButtonBgOff") return { color: config.home.colorButtonOff || "rgba(255,255,255,0.7)", label: "vs ícone" };
                                        if (key === "colorButtonBgOn") return { color: config.home.colorButtonOn || "#FFFFFF", label: "vs ícone" };
                                        if (key === "colorButtonOff") return { color: config.home.colorButtonBgOff || "rgba(0,0,0,0.8)", label: "vs fundo" };
                                        if (key === "colorButtonOn") return { color: config.home.colorButtonBgOn || "rgba(0,191,240,0.85)", label: "vs fundo" };
                                        return { color: "#FFFFFF", label: "vs branco" };
                                      };
                                      const wcagBadge = (bg: string, key: string) => {
                                        const p = pairFor(key);
                                        const r = contrastRatio(bg, p.color);
                                        if (r == null) return null;
                                        const val = r.toFixed(2);
                                        const passAAA = r >= 7;
                                        const passAA = r >= 4.5;
                                        const passAA_lg = r >= 3;
                                        const level = passAAA ? "AAA" : passAA ? "AA" : passAA_lg ? "AA Large" : "Falha";
                                        const color = passAA ? "#0a7d3a" : passAA_lg ? "#a66200" : "#b42318";
                                        const bgc = passAA ? "#dcfce7" : passAA_lg ? "#fef3c7" : "#fee2e2";
                                        return (
                                          <div className="mt-1 flex items-center gap-1 flex-wrap">
                                            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded font-bold" style={{ background: bgc, color }}>
                                              {val}:1 · {level}
                                            </span>
                                            <span className="text-[8px] uppercase font-bold opacity-50">{p.label}</span>
                                          </div>
                                        );
                                      };
                  
                  
                                      return (
                                        <div className="p-4 rounded-xl border-2 border-[var(--layout-accent-color)]/60 bg-white/40 space-y-3">
                                          <div className="flex items-center justify-between">
                                            <button
                                              type="button"
                                              className="flex items-center gap-2 flex-1 text-left"
                                              onClick={() => setOpenSections(prev => ({ ...prev, cores: !prev.cores }))}
                                            >
                                              <div className="p-1.5 rounded-lg bg-[var(--layout-accent-color)]/10 text-[var(--layout-accent-color)]">
                                                <Palette size={16} />
                                              </div>
                                              <h4 className="text-xs font-bold uppercase tracking-wider">Cores dos Elementos</h4>
                                              {openSections.cores ? <ChevronUp size={14} className="opacity-40 ml-auto" /> : <ChevronDown size={14} className="opacity-40 ml-auto" />}
                                            </button>
                                            <div className="ml-auto flex items-center gap-2 pl-4 border-l border-black/5">
                                              {!saving && savedFlash && (
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">✓ Cores salvas</span>
                                              )}
                                              <button
                                                type="button"
                                                disabled={saving}
                                                onClick={async () => {
                                                  if (saveTimeout.current) { clearTimeout(saveTimeout.current); saveTimeout.current = null; }
                                                  if (pendingSaveRef.current) {
                                                    await pendingSaveRef.current();
                                                  } else {
                                                    const configWithTabs = { ...config, _activeTab: activeTab, _weatherSubTab: weatherSubTab, _currencySubTab: currencySubTab, _screenRotation: externalRotation };
                                                    rtDrawChannelRef.current?.send({ type: "broadcast", event: "config-update", payload: { config: configWithTabs } });
                                                    setSavedFlash(true);
                                                    if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
                                                    savedFlashTimer.current = setTimeout(() => setSavedFlash(false), 2500);
                                                  }
                                                }}
                                                className="h-7 px-3 rounded-md text-[10px] font-bold uppercase tracking-wider bg-[var(--layout-accent-color)] text-white hover:opacity-90 disabled:opacity-50 shadow-sm"
                                              >
                                                {saving ? "Salvando…" : "Salvar cores"}
                                              </button>
                                            </div>
                                          </div>
                                          {openSections.cores && (
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-black/5 animate-in fade-in slide-in-from-top-2 duration-300">
                                              {colorFields.map(f => {
                                                const current = (config.home[f.key] as string) || f.def;
                                                const displayHex = normalizeHex(current) || normalizeHex(f.def) || "#000000";
                                                return (
                                                  <div key={f.key as string} className="flex items-center gap-2 p-2 rounded-lg bg-white/60 border border-black/5">
                                                    <div className="relative shrink-0" style={{ width: 30, height: 30 }}>
                                                      <div
                                                        className="w-full h-full rounded-md border-2 border-white shadow"
                                                        style={{ background: current }}
                                                      />
                                                      <input
                                                        type="color"
                                                        value={displayHex}
                                                        onChange={e => updateHome({ [f.key]: e.target.value.toUpperCase() } as Partial<HomeConfig>)}
                                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                                        aria-label={f.label}
                                                      />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                      <Label className="text-[10px] font-bold uppercase opacity-70 block leading-tight truncate">{f.label}</Label>
                                                      <input
                                                        type="text"
                                                        value={current}
                                                        onChange={e => updateHome({ [f.key]: e.target.value } as Partial<HomeConfig>)}
                                                        onBlur={e => {
                                                          const n = normalizeHex(e.target.value);
                                                          if (n) updateHome({ [f.key]: n } as Partial<HomeConfig>);
                                                        }}
                                                        placeholder="#RRGGBB ou rgb(r,g,b)"
                                                        className="w-full mt-0.5 text-[11px] font-mono px-2 py-1 rounded border border-black/10 bg-white uppercase tracking-tight focus:outline-none focus:border-[var(--layout-accent-color)]"
                                                      />
                                                      {wcagBadge(current, f.key as string)}
                                                    </div>
                                                  </div>
                                                );
                                              })}
                  
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })()}
                </div>
              </TabsContent>

            </Tabs>
          </div>

          {/* ── RIGHT: 9:16 Preview ── */}
          <div className="lg:flex-1 flex flex-col min-w-0 -mt-10" style={{ minHeight: 0 }}>
            {typeof document !== "undefined" && document.getElementById("cenario-preview-toolbar") && createPortal(
              <>
                <div className="flex flex-wrap items-center gap-2 mb-4 h-9">
                  <div className="flex items-center gap-1.5">
                    {externalConnected && (
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.3)" }}>
                        <Wifi size={10} style={{ color: "#4ade80" }} />
                        <span className="text-[10px] font-semibold" style={{ color: "#4ade80" }}>Online</span>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="relative group">
                      <button type="button" title="Cenário vertical 9:16" aria-label="Opções do cenário 9:16" className="h-9 w-10 rounded-lg flex items-center justify-center transition-colors" style={{ background: "var(--layout-header-bg, #0d0446)", color: "var(--layout-header-text, #fff)" }}>
                        <Smartphone size={18} />
                      </button>
                      <div className="absolute left-full top-0 pl-2 hidden group-hover:block group-focus-within:block z-50 min-w-[210px]">
                        <div className="rounded-xl bg-white p-1.5 shadow-lg border border-slate-200 text-slate-700">
                          <button type="button" onClick={() => setExternalRotation(prev => { const val = (prev + 90) % 360; cenarioBcRef.current?.postMessage({ type: "rotate", angle: val }); rtDrawChannelRef.current?.send({ type: "broadcast", event: "rotate", payload: { angle: val } }); return val; })} className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--layout-accent-color,#0055ff)] hover:text-white">
                            <RotateCw size={15} /> Rotacionar 90°
                          </button>
                          <button type="button" onClick={() => window.open(`/cenario-tela?tab=${activeTab}&weatherSubTab=${weatherSubTab}&uid=${user?.id || ""}`, "_blank")} className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--layout-accent-color,#0055ff)] hover:text-white">
                            <ExternalLink size={15} /> Abrir em nova aba
                          </button>
                          <button type="button" onClick={() => { const link = `${window.location.origin}/cenario-tela?tab=${activeTab}&weatherSubTab=${weatherSubTab}&uid=${user?.id || ""}`; navigator.clipboard.writeText(link).then(() => toast.success("Link do cenário 9:16 copiado")).catch(() => toast.error("Não foi possível copiar o link")); }} className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--layout-accent-color,#0055ff)] hover:text-white">
                            <Copy size={15} /> Copiar link cenário vMix
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="relative group">
                      <button type="button" title="Cenário horizontal 16:9" aria-label="Opções do cenário 16:9" aria-pressed={isFullWindowOpen} className="h-9 w-10 rounded-lg flex items-center justify-center transition-colors" style={{ background: isFullWindowOpen ? "var(--layout-accent-color,#0055ff)" : "var(--layout-header-bg,#0d0446)", color: "var(--layout-header-text,#fff)" }}>
                        <Monitor size={18} />
                      </button>
                      <div className="absolute right-0 top-full pt-2 hidden group-hover:block group-focus-within:block z-50 min-w-[210px]">
                        <div className="rounded-xl bg-white p-1.5 shadow-lg border border-slate-200 text-slate-700">
                          <button type="button" onClick={() => { if (fullWindowRef.current && !fullWindowRef.current.closed) { fullWindowRef.current.focus(); return; } const w = window.open(`/cenario-tela-full?tab=${activeTab}&weatherSubTab=${weatherSubTab}&uid=${user?.id || ""}`, "_blank"); if (w) { fullWindowRef.current = w; setIsFullWindowOpen(true); } }} className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--layout-accent-color,#0055ff)] hover:text-white">
                            <ExternalLink size={15} /> Abrir em nova aba
                          </button>
                          <button type="button" onClick={() => { const link = `${window.location.origin}/cenario-tela-full?tab=${activeTab}&weatherSubTab=${weatherSubTab}&uid=${user?.id || ""}`; navigator.clipboard.writeText(link).then(() => toast.success("Link do cenário 16:9 copiado")).catch(() => toast.error("Não foi possível copiar o link")); }} className="w-full flex items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-[var(--layout-accent-color,#0055ff)] hover:text-white">
                            <Copy size={15} /> Copiar link para vMix
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </>,
              document.getElementById("cenario-preview-toolbar")!
            )}

            {/* "Telas Conectadas" notification */}
            {showConnectedMsg && (
              <div
                className="flex items-center gap-2 px-3 py-1.5 rounded-full mb-2 mx-auto w-fit animate-fade-in"
                style={{
                  background: "rgba(74,222,128,0.15)",
                  border: "1px solid rgba(74,222,128,0.3)",
                }}
              >
                <div className="rounded-full" style={{ width: 6, height: 6, background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
                <span className="text-[11px] font-semibold" style={{ color: "#4ade80" }}>Telas conectadas</span>
              </div>
            )}

            <div data-nexo-skip className="flex flex-col items-center gap-3 w-full h-[530px] -mt-5 pt-0 min-h-0 overflow-hidden bg-transparent rounded-none relative">
              <div className="flex-1 w-full flex items-start justify-center overflow-hidden">
                <div
                  ref={previewWrapRef}
                  className="relative overflow-hidden"
                  data-nexo-skip
                  style={{
                    height: "100%",
                    width: "auto",
                    aspectRatio: "9 / 16",
                    borderRadius: 20,
                    boxShadow: "none",
                    background: "#000",
                  }}
                >
                <div className="absolute inset-0 overflow-hidden">
                  {/* Virtual 1080×1920 canvas, scaled to fit — mirrors CenarioTela exactly */}
                  <div style={{ width: PREV_W, height: PREV_H, transform: `scale(${previewScale})`, transformOrigin: "top left", position: "absolute", top: 0, left: 0 }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", fontSize: `${pvh(1.8)}px` }}>

                    {/* Fullscreen background layers */}
                    {activeTab === "weather" && weatherSubTab === "satellite" && weatherCoords && (
                      <div className="absolute inset-0" style={{ zIndex: 5 }}>
                        <SatelliteMap 
                          lat={config.weather.lat ?? weatherCoords.lat} 
                          lon={config.weather.lon ?? weatherCoords.lon} 
                          zoom={config.weather.zoom} 
                          interactive
                          onMove={(lat, lon, z) => {
                            updateWeather({ lat, lon, zoom: z });
                            cenarioBcRef.current?.postMessage({ type: "zoom-change", zoom: z });
                            rtDrawChannelRef.current?.send({ type: "broadcast", event: "zoom-change", payload: { zoom: z } });
                          }}
                        />
                      </div>
                    )}
                    {activeTab === "traffic" && config.traffic.enabled && trafficCoords && (
                      <div className="absolute inset-0" style={{ zIndex: 5 }}>
                        <TrafficMap 
                          lat={config.traffic.lat ?? trafficCoords.lat} 
                          lon={config.traffic.lon ?? trafficCoords.lon} 
                          zoom={config.traffic.zoom} 
                          interactive 
                          points={config.traffic.points}
                          activePointId={activeTrafficPointId}
                          onMove={(lat, lon, zoom) => updateTraffic({ lat, lon, zoom })} 
                          onPointMove={(id, lat, lon) => updateTrafficPointPosition(id, lat, lon)}
                          onPointSelect={(id) => {
                            const p = config.traffic.points.find(pt => pt.id === id);
                            if (p) goToTrafficPoint(p);
                          }}
                        />
                      </div>
                    )}
                    {!((activeTab === "weather" && weatherSubTab === "satellite" && config.weather.showSatellite) || (activeTab === "traffic" && config.traffic.enabled)) && (() => {
                      const bgType = config.bgType || "static";
                      const useThumb = bgType === "thumb" && (activeTab === "home" || activeTab === "weather" || activeTab === "currency" || activeTab === "chat");
                      const useGradient = bgType === "gradient" && (activeTab === "home" || activeTab === "weather" || activeTab === "currency" || activeTab === "chat");
                      const thumbSrc = currentProgram?.thumb || currentProgram?.capa || "";
                      
                      return (
                        <div className="absolute inset-0" style={{ background: useGradient ? buildHomeGradient(config.home) : (bgType === "static" && config.home.bgImage ? "#e8e8e8" : "transparent"), zIndex: 0 }}>
                          {artistBgUrl && activeTab === "home" && config.home.showArtistImage && (
                            <img src={artistBgUrl} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: "saturate(1.2) brightness(0.7)" }} />
                          )}
                          {useThumb && thumbSrc && (
                            <>
                              <img 
                                src={thumbSrc} 
                                alt="" 
                                className="absolute inset-0 w-full h-full object-cover" 
                                style={{ 
                                  filter: "blur(18px) brightness(0.55)", 
                                  transform: "scale(1.1)",
                                  objectPosition: config.programThumbPosition || "center"
                                }} 
                              />
                              {config.thumbOverlayEnabled && (
                                <div 
                                  className="absolute inset-0 transition-opacity duration-1000" 
                                  style={{ 
                                    opacity: (config.thumbOverlayOpacity ?? 60) / 100,
                                    background: config.thumbOverlayColor || "#000000"
                                  }} 
                                />
                              )}
                              <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 100%)" }} />
                            </>
                          )}
                          {bgType === "static" && config.home.bgImage && (activeTab === "home" || activeTab === "weather" || activeTab === "currency" || activeTab === "chat") && (
                            <img src={config.home.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />
                          )}
                          {activeTab === "weather" && config.weather.bgImage && <img src={config.weather.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                          
                          {activeTab === "currency" && config.currency.bgImage && <img src={config.currency.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                          {activeTab === "chat" && config.chat.bgImage && <img src={config.chat.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                        </div>
                      );
                    })()}

                    {/* Sidebar — matches CenarioTela exactly */}
                    {(() => {
                      const isMapTab = (activeTab === "weather" && weatherSubTab === "satellite" && config.weather.showSatellite) || (activeTab === "traffic" && config.traffic.enabled);
                      const bS = `${pvh(3.8)}px`;
                      const iS = `${pvh(1.7)}px`;
                      const sBS = `${pvh(2.8)}px`;
                      const sFS = `${pvh(1.2)}px`;
                      const sPad = `${pvh(0.6)}px`;
                      const btnBg = (active: boolean) => active ? (config.home.colorButtonBgOn || "rgba(0,191,240,0.85)") : (config.home.colorButtonBgOff || "rgba(0,0,0,0.8)");
                      const btnIcon = (active: boolean) => active ? (config.home.colorButtonOn || "#fff") : (config.home.colorButtonOff || "rgba(255,255,255,0.7)");
                      return (
                        <div className="flex items-center" style={{ position: "absolute", left: 0, top: "28%", width: "8%", zIndex: 10, pointerEvents: "none" }}>
                          <div className="flex flex-col items-center" style={{ pointerEvents: "auto", gap: sPad, padding: 0, marginLeft: 0 }}>
                            <button onClick={() => handleTabChange("home")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: bS, height: bS, background: btnBg(activeTab === "home"), border: "none", color: btnIcon(activeTab === "home"), textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
                              <Home style={{ width: iS, height: iS }} />
                            </button>
                            <div className="flex flex-col items-center" style={{ padding: `${pvh(0.4)}px`, opacity: config.weather.enabled ? 1 : 0.35 }}>
                              <button onClick={() => { if (activeTab === "weather" || activeTab === "enquete") { handleTabChange("home"); } else { handleTabChange("weather"); handleWeatherSubTabChange("today"); } }} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: bS, height: bS, background: btnBg(activeTab === "weather" || activeTab === "enquete"), border: "none", color: btnIcon(activeTab === "weather" || activeTab === "enquete"), textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
                                <CloudSun style={{ width: iS, height: iS }} />
                              </button>
                              <div style={{ overflow: "hidden", maxHeight: (activeTab === "weather" || activeTab === "enquete") ? `${pvh(20)}px` : "0", transition: "max-height 0.35s cubic-bezier(0.4,0,0.2,1)", opacity: (activeTab === "weather" || activeTab === "enquete") ? 1 : 0 }}>
                                <div className="flex flex-col items-center" style={{ gap: `${pvh(0.4)}px`, paddingTop: `${pvh(0.4)}px` }}>
                                  {config.weather.enabled && (
                                    <button onClick={() => { handleTabChange("weather"); handleWeatherSubTabChange("today"); }} className="rounded-full flex items-center justify-center font-bold cursor-pointer transition-all" style={{ width: sBS, height: sBS, fontSize: sFS, background: btnBg(activeTab === "weather" && weatherSubTab === "today"), border: "none", color: btnIcon(activeTab === "weather" && weatherSubTab === "today"), textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>1</button>
                                  )}
                                  {config.weather.enabled && config.weather.showSatellite && (
                                    <button onClick={() => { handleTabChange("weather"); handleWeatherSubTabChange("satellite"); }} className="rounded-full flex items-center justify-center font-bold cursor-pointer transition-all" style={{ width: sBS, height: sBS, fontSize: sFS, background: btnBg(activeTab === "weather" && weatherSubTab === "satellite"), border: "none", color: btnIcon(activeTab === "weather" && weatherSubTab === "satellite"), textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>2</button>
                                  )}

                                  </div>
                                </div>
                              </div>

                            <button onClick={() => config.traffic.enabled && handleTabChange("traffic")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: bS, height: bS, marginTop: `${pvh(0.3)}px`, background: btnBg(activeTab === "traffic"), border: "none", color: btnIcon(activeTab === "traffic"), opacity: config.traffic.enabled ? 1 : 0.35, textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
                              <Car style={{ width: iS, height: iS }} />
                            </button>
                            <div className="flex flex-col items-center" style={{ padding: `${pvh(0.4)}px`, opacity: config.currency.enabled ? 1 : 0.35 }}>
                              <button onClick={() => { if (!config.currency.enabled) return; if (activeTab === "currency") { handleTabChange("home"); } else { handleTabChange("currency"); handleCurrencySubTabChange("moedas"); } }} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: bS, height: bS, background: btnBg(activeTab === "currency"), border: "none", color: btnIcon(activeTab === "currency"), textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
                                <DollarSign style={{ width: iS, height: iS }} />
                              </button>
                              <div style={{ overflow: "hidden", maxHeight: activeTab === "currency" ? `${pvh(10)}px` : "0", transition: "max-height 0.4s cubic-bezier(0.4,0,0.2,1)", opacity: activeTab === "currency" ? 1 : 0 }}>
                                <div className="flex flex-col items-center" style={{ gap: `${pvh(0.4)}px`, paddingTop: `${pvh(0.4)}px` }}>
                                   <button onClick={() => { handleTabChange("currency"); handleCurrencySubTabChange("moedas"); }} className="rounded-full flex items-center justify-center font-bold cursor-pointer" style={{ width: sBS, height: sBS, fontSize: sFS, background: btnBg(activeTab === "currency" && currencySubTab === "moedas"), border: "none", color: btnIcon(activeTab === "currency" && currencySubTab === "moedas"), textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>1</button>
                                   <button onClick={() => { handleTabChange("currency"); handleCurrencySubTabChange("bolsas"); }} className="rounded-full flex items-center justify-center font-bold cursor-pointer" style={{ width: sBS, height: sBS, fontSize: sFS, background: btnBg(activeTab === "currency" && currencySubTab === "bolsas"), border: "none", color: btnIcon(activeTab === "currency" && currencySubTab === "bolsas"), textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>2</button>
                                </div>
                              </div>
                            </div>
                            <button onClick={() => config.chat.enabled && handleTabChange("chat")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: bS, height: bS, background: btnBg(activeTab === "chat"), border: "none", color: btnIcon(activeTab === "chat"), opacity: config.chat.enabled ? 1 : 0.35, textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
                              <MessageCircle style={{ width: iS, height: iS }} />
                            </button>
                            <button onClick={() => { setPreviewDrawActive(p => { const n = !p; if (!n) { setShowPreviewDrawOptions(false); setShowShapesPanel(false); } else { setPreviewDrawMode("pen"); } return n; }); }} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: bS, height: bS, marginTop: `${pvh(0.3)}px`, background: btnBg(previewDrawActive), border: "none", color: btnIcon(previewDrawActive), textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
                              <Pen style={{ width: iS, height: iS }} />
                            </button>
                            {previewDrawActive && (
                              <>
                                 <button onClick={() => { setShowPreviewDrawOptions(p => !p); setShowShapesPanel(false); }} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: sBS, height: sBS, background: btnBg(showPreviewDrawOptions), border: "none" }}>
                                   <div style={{ width: `${pvh(1.2)}px`, height: `${pvh(1.2)}px`, borderRadius: "50%", background: previewDrawColor, boxShadow: "0 1px 3px rgba(0,0,0,0.5)" }} />
                                 </button>
                                 <button onClick={() => setPreviewDrawMode(m => m === "eraser" ? "pen" : "eraser")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: sBS, height: sBS, background: btnBg(previewDrawMode === "eraser"), border: "none", color: btnIcon(previewDrawMode === "eraser"), textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
                                   <Eraser size={pvh(1)} />
                                 </button>
                                 <button onClick={undoLastDraw} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: sBS, height: sBS, background: btnBg(false), border: "none", color: btnIcon(false), textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
                                   <Undo2 size={pvh(1)} />
                                 </button>
                                 <button onClick={() => { setShowShapesPanel(p => !p); setShowPreviewDrawOptions(false); if (previewDrawMode !== "shape") { setPreviewDrawMode("shape"); if (!selectedShape) setSelectedShape("arrow-up"); } else { setPreviewDrawMode("pen"); } }} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: sBS, height: sBS, background: btnBg(previewDrawMode === "shape"), border: "none", color: btnIcon(previewDrawMode === "shape"), textShadow: "0 1px 3px rgba(0,0,0,0.5)" }}>
                                   <Shapes size={pvh(1)} />
                                 </button>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })()}


                    {/* Content area */}
                    <div className="flex-1 relative" style={{ zIndex: 1 }}>
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
                        return (
                          <div ref={homeContentRef} className="absolute inset-0" style={{ color: "#fff", overflow: "hidden" }}>
                            {(() => {
                              const altMode = !!config.bgAlternateMode;
                              const thumbSrc = currentProgram?.thumb || currentProgram?.capa || "";
                              const hasThumb = !!thumbSrc;
                              const hasArtist = !!artistBgUrl;
                              const bgType = config.bgType || "static";
                              let thumbVisible: boolean;
                              let artistVisible: boolean;
                              if (altMode) {
                                // O Preview deve refletir o fundo do artista ativo nas telas externas.
                                artistVisible = hasArtist && !!config.home.showArtistImage && !isNoPlayback;
                                thumbVisible = !artistVisible && hasThumb && altBgPhase === "thumb";
                              } else {
                                thumbVisible = bgType === "thumb" && hasThumb;
                                artistVisible = hasArtist && !!config.home.showArtistImage && !isNoPlayback;
                              }
                              return (
                                <>
                                  {/* Thumb layer (always mounted for fade) */}
                                  {hasThumb && (
                                    <div className="absolute inset-0" style={{ opacity: thumbVisible ? 1 : 0, transition: "opacity 1.2s ease-in-out" }}>
                                      <img 
                                        src={thumbSrc} 
                                        alt="" 
                                        className="absolute inset-0 w-full h-full object-cover" 
                                        style={{ 
                                          ...(altMode ? {} : { filter: "blur(18px) brightness(0.55)", transform: "scale(1.1)" }),
                                          objectPosition: config.programThumbPosition || "center"
                                        }} 
                                      />
                                      {!altMode && (
                                        <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 100%)" }} />
                                      )}
                                    </div>
                                  )}
                                  {/* Artist crossfade (previous) */}
                                  {prevArtistBgUrl && prevArtistBgUrl !== artistBgUrl && (
                                    <img src={prevArtistBgUrl} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ opacity: artistVisible && !artistBgReady ? 1 : 0, filter: "saturate(1.2)", transition: "opacity 1.2s ease-in-out" }} />
                                  )}
                                  {artistBgUrl && (
                                    <img src={artistBgUrl} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ opacity: artistVisible ? (artistBgReady ? 1 : 0) : 0, filter: "saturate(1.2)", transform: artistVisible ? "scale(1.14)" : "scale(1.08)", transformOrigin: "center center", animation: artistVisible ? "artistBackgroundPan 10s ease-in-out infinite alternate" : "none", transition: "opacity 1.2s ease-in-out" }} onLoad={() => setArtistBgReady(true)} />
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
                                  {!altMode && <div className="absolute inset-0" style={{ opacity: artistVisible ? 1 : 0, background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.5) 100%)", transition: "opacity 1.2s ease-in-out" }} />}
                                   {bgType === "gradient" && !artistVisible && !thumbVisible && <div className="absolute inset-0" style={{ background: buildHomeGradient(config.home) }} />}
                                   {!artistVisible && !thumbVisible && bgType === "static" && config.home.bgImage && <img src={config.home.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                                </>
                              );
                            })()}
                            

                                                          {/* Relógio e data no canto superior esquerdo */}
                             <div style={{ position: "absolute", top: `${pvh(3.2)}px`, left: `${pvh(3.2)}px`, zIndex: 20, display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "left", color: "#fff", textShadow: "0 2px 10px rgba(0,0,0,0.45)", pointerEvents: "none" }}>
                               <div style={{ fontSize: `${pvh(2.7)}px`, fontWeight: 400, fontVariantNumeric: "tabular-nums", lineHeight: 1.05, letterSpacing: "0.01em", color: config.home.colorClock || "#fff", whiteSpace: "nowrap" }}>{currentTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</div>
                               <div style={{ fontSize: `${pvh(1.05)}px`, fontWeight: 400, lineHeight: 1.25, marginTop: `${pvh(0.45)}px`, color: config.home.colorDate || "#fff", whiteSpace: "nowrap" }}>{currentTime.toLocaleDateString("pt-BR", { weekday: "long" }).replace(/-feira$/, "").replace(/^./, c => c.toUpperCase()) + " - " + currentTime.getDate() + " de " + currentTime.toLocaleDateString("pt-BR", { month: "long" }).replace(/^./, c => c.toUpperCase()) + "/" + currentTime.toLocaleDateString("pt-BR", { year: "2-digit" })}</div>
                             </div>
                             {/* Condição atual no canto superior direito; indicadores alternam a cada 4 segundos */}
                             {liveWeather && (
                               <div style={{ position: "absolute", top: `${pvh(2.5)}px`, right: `${pvh(3.2)}px`, zIndex: 20, width: `${pvh(20)}px`, display: "flex", flexDirection: "column", alignItems: "flex-end", textAlign: "right", color: "#fff", textShadow: "0 2px 10px rgba(0,0,0,0.5)", pointerEvents: "none" }}>
                                 <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: `${pvh(0.7)}px` }}>
                                   <div style={{ fontSize: `${pvh(2.3)}px`, fontWeight: 400, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{liveWeather.current.temp}°</div>
                                   <WeatherIcon code={liveWeather.current.code} size={pvh(4.4)} forceDay />
                                 </div>
                                 <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: `${pvh(0.45)}px`, width: "100%", marginTop: `${pvh(0.45)}px`, fontSize: `${pvh(1.05)}px`, fontWeight: 500, lineHeight: 1.2, whiteSpace: "nowrap" }}>
                                   <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: `${pvh(0.6)}px` }}><CloudRain size={pvh(1.25)} /> <span>{liveWeather.daily?.[0]?.precip ?? 0}%</span></div>
                                   <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: `${pvh(0.6)}px` }}><Droplets size={pvh(1.25)} /> <span>{liveWeather.current.humidity}%</span></div>
                                   {(liveWeather.daily?.[0]?.precip ?? 0) > 0 && <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: `${pvh(0.6)}px` }}><CloudRain size={pvh(1.25)} /> <span>{(liveWeather.daily?.[0]?.rainMm ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm</span></div>}
                                 </div>
                               </div>
                             )}
                             
{/* ── BOTTOM-RIGHT: "A seguir" ── */}
                             {nextProgram && (
                               <div style={{ position: "absolute", bottom: `${pvh(4)}px`, right: `${pvh(5)}px`, zIndex: 20, textAlign: "right" }}>
                                  <div className="font-semibold" style={{ fontSize: `${pvh(1.1)}px`, color: config.home.colorASeguirLabel || "var(--layout-accent-color, #888)", marginBottom: `${pvh(0.5)}px` }}>
                                    <span style={{ color: config.home.colorASeguirLabel || "var(--layout-accent-color)" }}>a seguir</span>
                                  </div>
                                  <div className="font-bold" style={{ fontSize: `${pvh(1.65)}px`, lineHeight: 1.1, textShadow: "0 1px 6px rgba(0,0,0,0.4)", color: config.home.colorNextProgram || "#fff" }}>{nextProgram.nome.length > 12 ? `${nextProgram.nome.slice(0, 12)}...` : nextProgram.nome}</div>
                                  <div className="font-medium" style={{ fontSize: `${pvh(0.9)}px`, color: config.home.colorNextProgram || "#fff", fontVariantNumeric: "tabular-nums", marginTop: `${pvh(0.2)}px` }}>{nextProgram.horario_inicio.slice(0,5)}h</div>
                               </div>
                             )}

                             <style>{"@keyframes artistBackgroundPan { 0% { transform: scale(1.08) translateX(-1.8%); } 100% { transform: scale(1.08) translateX(1.8%); } }"}</style>
                             {/* ── WRAPPER: BOX DO LOCUTOR + BOX CAPA (Top Right) ── */}
                             {(() => {
                               const showProgram = false; // A capa do programa no ar foi removida; exibir somente a capa da música.
                               const showMusic = !!musicData?.capa && !isBreakTrack && config.home.showMusicCover !== false;
                               const currentPhase = (showProgram && showMusic) ? (Math.floor(currentTime.getTime() / 8000) % 2 === 0 ? "program" : "music") : (showProgram ? "program" : "music");
                               
                               return (
                                 <div style={{
                                   position: "absolute",
                                   top: "50%",
                                   left: "50%",
                                   transform: "translate(-50%, -50%)",
                                   display: "flex",
                                   flexDirection: "column",
                                   alignItems: "center",
                                   zIndex: 15,
                                 }}>
                                   <div style={{
                                     display: "flex",
                                     alignItems: "stretch",
                                     position: "relative",
                                     width: `${pvh(18.2)}px`,
                                     height: `${pvh(18.2)}px`
                                   }}>
                                     {/* ── BOX DO LOCUTOR: quadrado 1:1 ── */}
                                     <div style={{
                                       width: "100%",
                                       height: "100%",
                                       borderRadius: `${pvh(2)}px`,
                                       overflow: "hidden",
                                       background: `linear-gradient(145deg, var(--layout-accent-color, rgba(200,50,50,0.7)), rgba(0,0,0,0.4))`,
                                       backdropFilter: "blur(20px)",
                                       WebkitBackdropFilter: "blur(20px)",
                                       padding: `${pvh(0.9)}px`,
                                       boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                                       border: "1px solid rgba(255,255,255,0.1)",
                                       display: "flex",
                                       flexDirection: "column",
                                       gap: `${pvh(0.6)}px`,
                                       zIndex: 2,
                                       flexShrink: 0,
                                       transition: "opacity 1s cubic-bezier(0.4, 0, 0.2, 1), transform 1s cubic-bezier(0.4, 0, 0.2, 1)",
                                       transform: `scale(${currentPhase === "program" ? 1 : 0.9}) rotate(${currentPhase === "program" ? 0 : -5}deg)`,
                                       position: "absolute",
                                       inset: 0
                                     }}>
                                        <div className="flex items-start justify-end" style={{ minWidth: 0 }}>
                                          {currentProgram?.selo && (
                                            <img src={currentProgram.selo} alt="" className="object-contain" style={{ maxHeight: `${pvh(5.82)}px`, maxWidth: `${pvh(8.74)}px`, flexShrink: 0, filter: "drop-shadow(0 1px 4px rgba(0,0,0,0.3))" }} />
                                          )}
                                        </div>
                                       <div className="flex-1 flex items-center justify-center" style={{ minHeight: 0 }}>
                                         {(() => {
                                           const fotos = currentProgram?.apresentadoresFotos?.length ? currentProgram.apresentadoresFotos : (currentProgram?.apresentadorFoto ? [currentProgram.apresentadorFoto] : []);
                                           const activeFoto = fotos[presenterIdx % (fotos.length || 1)];
                                           if (!activeFoto) return null;
                                           return (
                                             <img key={activeFoto} src={activeFoto} alt="" style={{ maxHeight: `${pvh(8.6)}px`, maxWidth: "100%", objectFit: "contain", filter: "drop-shadow(0 4px 16px rgba(0,0,0,0.4))", WebkitMaskImage: "linear-gradient(to top, transparent 0%, rgba(0,0,0,1) 18%)", maskImage: "linear-gradient(to top, transparent 0%, rgba(0,0,0,1) 18%)" }} />
                                           );
                                         })()}
                                       </div>
                                         <div style={{ minHeight: 0 }}>
                                           <div className="flex flex-col items-center justify-center" style={{ gap: `${pvh(0.2)}px`, padding: `${pvh(0.5)}px` }}>
                                              <div className="flex items-center justify-center w-full" style={{ gap: `${pvh(0.4)}px` }}>
                                                <Mic size={pvh(1.2)} style={{ opacity: 0.9, flexShrink: 0, color: "#fff" }} />
                                                <span className="font-bold text-white text-center" style={{ fontSize: `${pvh(1.1)}px`, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "normal", textShadow: "0 2px 8px rgba(0,0,0,1)", lineHeight: 1.2 }}>
                                                  {currentProgram?.apresentador || currentProgram?.nome || ""}
                                                </span>
                                              </div>
                                             {currentProgram?.apresentadorInstagram && (
                                               <span className="font-semibold" style={{ fontSize: `${pvh(0.9)}px`, color: "var(--layout-accent-color)", opacity: 0.9, textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>
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
                                         borderRadius: `${pvh(2)}px`,
                                         overflow: "hidden",
                                         flexShrink: 0,
                                         zIndex: 2,
                                         opacity: showMusic && currentPhase === "music" ? 1 : 0,
                                         visibility: showMusic && currentPhase === "music" ? "visible" : "hidden",
                                         transition: "opacity 1s cubic-bezier(0.4, 0, 0.2, 1), transform 1s cubic-bezier(0.4, 0, 0.2, 1)",
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
                                             borderRadius: `${pvh(2)}px`,
                                           }}
                                         />
                                       )}
                                     </div>
                                   </div>

                                   {/* ── Music Details (Text below cover) ── */}
                                   {musicData && showMusic && (
                                     <div style={{
                                       marginTop: `${pvh(1)}px`,
                                       textAlign: "center",
                                       width: "100%",
                                       opacity: currentPhase === "music" ? 1 : 0,
                                       transform: `translateY(${currentPhase === "music" ? 0 : pvh(1)}px)`,
                                       transition: "opacity 0.8s ease, transform 0.8s ease",
                                       visibility: currentPhase === "music" ? "visible" : "hidden"
                                      }}>
                                       <div className="font-extrabold" style={{ fontSize: `${pvh(1.7)}px`, color: config.home.colorMusicName || "#fff", textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>
                                         {musicData.titulo}
                                       </div>
                                       <div className="font-normal" style={{ fontSize: `${pvh(1)}px`, color: config.home.colorMusicTitle || "var(--layout-accent-color, #4ade80)", marginTop: `${pvh(0.2)}px`, textShadow: "0 2px 8px rgba(0,0,0,0.5)" }}>
                                         {musicData.artista}
                                       </div>
                                     </div>
                                   )}
                                 </div>
                               );
                             })()}

                             {/* ── Sponsor logos (centered bottom, same as external screen) ── */}
                             {sponsorLogos.length > 0 && (
                               <div style={{ position: "absolute", bottom: `${pvh(5)}px`, left: "50%", transform: "translateX(-50%)", zIndex: 10 }}>
                                 <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center", height: `${pvh(23.4)}px` }}>
                                   {sponsorLogos.map((l, i) => l.logo_url && (
                                     <img key={l.id} src={l.logo_url} alt={l.nome} className="object-contain" style={{ position: "absolute", maxWidth: `${pvh(33.15)}px`, maxHeight: `${pvh(18.275)}px`, opacity: i === sponsorIdx ? 1 : 0, transform: i === sponsorIdx ? "scale(1)" : "scale(0.9)", transition: "opacity 0.8s ease, transform 0.8s ease", filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))" }} />
                                   ))}
                                 </div>
                               </div>
                             )}

                                                                                       {/* Foto do locutor ampliada 40%, ancorada na base; identificação sobre a foto */}
                             {currentProgram && (() => {
                               const fotos = currentProgram.apresentadoresFotos?.length ? currentProgram.apresentadoresFotos : (currentProgram.apresentadorFoto ? [currentProgram.apresentadorFoto] : []);
                               const foto = fotos[presenterIdx % (fotos.length || 1)];
                               return (
                                 <div style={{ position: "absolute", left: `${pvh(2.6)}px`, bottom: 0, width: `${pvh(26.6)}px`, height: `${pvh(23.8)}px`, zIndex: 14, pointerEvents: "none" }}>
                                   {foto && <img src={foto} alt="" style={{ position: "absolute", bottom: 0, left: 0, width: "100%", height: "100%", objectFit: "contain", objectPosition: "bottom left", filter: "drop-shadow(0 2px 12px rgba(0,0,0,0.35))", WebkitMaskImage: "none", maskImage: "none" }} />}
                                   <div style={{ position: "absolute", left: 0, bottom: `${pvh(3.5)}px`, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: `${pvh(0.25)}px`, maxWidth: `${pvh(34)}px`, textAlign: "left", textShadow: "0 2px 8px rgba(0,0,0,0.8)", zIndex: 16 }}>
                                   <span style={{ fontSize: `${pvh(1)}px`, fontWeight: 600, color: config.home.colorASeguirLabel || "var(--layout-accent-color, #fff)", letterSpacing: "0.04em" }}>no ar</span>
                                   <span style={{ fontSize: `${pvh(1.65)}px`, fontWeight: 700, color: "#fff", lineHeight: 1.1 }}>{currentProgram.nome}</span>
                                   <span style={{ fontSize: `${pvh(1)}px`, fontWeight: 500, color: "#fff", opacity: 0.9, lineHeight: 1.1 }}>{currentProgram.apresentador || ""}</span>
                                   </div>
                                 </div>
                               );
                             })()}
                             {/* Barra premium: trilho translúcido e preenchimento luminoso */}
                             <div style={{ position: "absolute", bottom: `${pvh(2)}px`, left: `${pvh(2.6)}px`, right: `${pvh(2.6)}px`, height: `${pvh(0.32)}px`, background: "rgba(255,255,255,0.42)", zIndex: 15, overflow: "hidden", borderRadius: "999px" }}>
                               <div style={{ width: `${progressPct}%`, height: "100%", background: config.home.colorProgressBar || "#fff", transition: "width 1s linear" }} />
                             </div>
                             <style>{`
                               @keyframes shimmerProgress { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
                               @keyframes cenario-row-enter {
                                 0% { opacity: 0; transform: translateX(20px); }
                                 100% { opacity: 1; transform: translateX(0); }
                               }
                               .cenario-anim-row-1 { animation: cenario-row-enter 0.6s cubic-bezier(0.16, 1, 0.3, 1) both 0.1s; }
                               .cenario-anim-row-2 { animation: cenario-row-enter 0.6s cubic-bezier(0.16, 1, 0.3, 1) both 0.2s; }
                               .cenario-anim-row-3 { animation: cenario-row-enter 0.6s cubic-bezier(0.16, 1, 0.3, 1) both 0.3s; }
                             `}</style>
                          </div>
                        );
                      })()}

                      {/* ═══ ENQUETE ═══ */}
                      {activeTab === "enquete" && (
                        <div className="flex flex-col items-center justify-start h-full w-full overflow-hidden" style={{ gap: pvh(2), paddingTop: `${pvh(3)}px`, paddingLeft: `${pvh(4)}px`, paddingRight: `${pvh(4)}px`, color: config.home.colorMusicName || "#fff" }}>
                          <div className="text-center">
                            <div className="font-black leading-tight" style={{ fontSize: pvh(6), textShadow: "0 4px 20px rgba(0,0,0,0.5)" }}>ENQUETE</div>
                            
                          </div>

                          {(() => {
                            const today = new Date().toISOString().split('T')[0];
                            const nowTimeStr = new Date().toTimeString().slice(0, 5);
                            const activePoll = enquetes.find(e => e.data_enquete === today && e.horario_inicio <= nowTimeStr && e.horario_fim >= nowTimeStr);

                            if (activePoll) {
                              return (
                                <div className="w-full flex flex-col gap-[3vh] px-[4vh]">
                                  <div className="p-[3vh] rounded-[2vh] bg-black/40 backdrop-blur-md border border-white/10 text-center">
                                    <h3 className="font-bold leading-tight" style={{ fontSize: pvh(3.5) }}>{activePoll.pergunta}</h3>
                                  </div>
                                  <div className="grid grid-cols-2 gap-[2vh]">
                                    {[activePoll.resposta1, activePoll.resposta2, activePoll.resposta3, activePoll.resposta4].filter(Boolean).map((resp, idx) => (
                                      <div key={idx} className="p-[2vh] rounded-[1.5vh] border border-white/10 flex items-center gap-[1.5vh]" style={{ background: 'rgba(255,255,255,0.05)' }}>
                                        <div className="w-[4vh] h-[4vh] rounded-full flex items-center justify-center font-black text-[2vh]" style={{ background: accentColor, color: config.home.colorClock || "#fff" }}>{idx + 1}</div>
                                        <span className="font-bold text-[1.8vh] truncate">{resp}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              );
                            }
                            return (
                              <div className="opacity-40 flex flex-col items-center">
                                <Tag size={pvh(8)} className="mb-2" style={{ color: config.home.colorMusicTitle || "var(--layout-accent-color, #00BFF0)" }} />
                                <div className="font-bold uppercase tracking-widest text-xs">Nenhuma enquete ativa</div>
                              </div>
                            );
                          })()}
                        </div>
                      )}

                      {/* ═══ WEATHER ═══ */}

                      {activeTab === "weather" && weatherSubTab !== "satellite" && (
                        <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ color: config.home.colorMusicName || "#fff" }}>
                          {!config.weather.bgImage && <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, #0a1628 0%, #0d2847 30%, #134e7a 60%, #1a6fad 85%, #4a9fd4 100%)" }} />}
                          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 75% 15%, rgba(255,255,255,0.12) 0%, transparent 55%)" }} />
                          <div className="absolute bottom-0 left-0 right-0" style={{ height: "40%", background: "linear-gradient(to top, rgba(0,0,0,0.45), transparent)" }} />
                          <div className="relative z-10 flex flex-col h-full items-center justify-start overflow-y-auto" style={{ padding: `${pvh(2.5)}px ${pvh(3)}px ${pvh(2)}px`, paddingLeft: `calc(${pvh(3)}px + 50px)` }}>
                            {liveWeather ? (<>
                              {weatherSubTab === "today" && (
                                <div className="flex flex-col items-center justify-start h-full w-full overflow-y-auto" style={{ gap: `${pvh(1.5)}px`, padding: `${pvh(1.5)}px ${pvh(2)}px` }}>
                                  <div className="text-center" style={{ marginBottom: `${pvh(1)}px` }}>
                                    <div className="font-black leading-none" style={{ fontSize: `${pvh(4.2)}px`, letterSpacing: "-0.03em", textShadow: "0 3px 20px rgba(0,0,0,0.6)" }}>{weatherCity || config.city || "Cidade"}</div>
                                    <div className="font-bold uppercase tracking-widest" style={{ fontSize: `${pvh(1.5)}px`, color: config.home.colorMusicTitle || "var(--layout-accent-color, #00BFF0)", marginTop: `${pvh(0.6)}px`, letterSpacing: "0.2em" }}>Previsão do Tempo</div>
                                  </div>

                                  {config.weather.showCurrent && (
                                    <div className="rounded-3xl w-full max-w-[90%]" style={{ padding: `${pvh(2.5)}px`, background: "rgba(255,255,255,0.08)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.15)", boxShadow: "0 12px 48px rgba(0,0,0,0.2)" }}>
                                      <div className="flex items-center justify-center" style={{ gap: `${pvh(3)}px`, marginBottom: `${pvh(2)}px` }}>
                                        <div style={{ width: `${pvh(10)}px`, height: `${pvh(10)}px`, filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.3))" }}>
                                          <WeatherIcon code={liveWeather.current.code} size={pvh(10)} forceDay />
                                        </div>
                                        <div className="flex flex-col">
                                          <div className="font-black" style={{ fontSize: `${pvh(6.5)}px`, lineHeight: 0.9, textShadow: "0 3px 16px rgba(0,0,0,0.4)" }}>{liveWeather.current.temp}°</div>
                                          <div className="font-medium" style={{ fontSize: `${pvh(1.8)}px`, opacity: 0.85, marginTop: `${pvh(0.3)}px` }}>{getWLabel(liveWeather.current.code)}</div>
                                        </div>
                                      </div>
                                      <div className="flex items-center justify-between rounded-2xl" style={{ padding: `${pvh(1.5)}px ${pvh(2.2)}px`, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.08)" }}>
                                        <div className="flex items-center" style={{ gap: `${pvh(0.8)}px` }}>
                                          <Thermometer size={pvh(2)} style={{ opacity: 0.7 }} />
                                          <span className="font-bold tabular-nums" style={{ fontSize: `${pvh(2)}px` }}>{liveWeather.daily[0]?.min ?? "--"}° / {liveWeather.daily[0]?.max ?? "--"}°</span>
                                        </div>
                                        <div className="flex items-center" style={{ gap: `${pvh(1.5)}px`, fontSize: `${pvh(1.6)}px` }}>
                                          <span className="flex items-center" style={{ gap: `${pvh(0.4)}px` }}><Droplets size={pvh(1.6)} style={{ color: "var(--layout-accent-color, #444)" }} /> <span style={{ color: "var(--layout-accent-color, #444)", fontWeight: 700 }}>{liveWeather.current.humidity}%</span></span>
                                          <span className="flex items-center" style={{ gap: `${pvh(0.4)}px` }}><CloudRain size={pvh(1.6)} style={{ color: "rgba(255,255,255,0.7)" }} /> <span style={{ color: "rgba(255,255,255,0.7)", fontWeight: 700 }}>{liveWeather.daily[0]?.precip ?? 0}%</span></span>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {config.weather.showForecast3Days && (
                                    <div className="w-full max-w-[90%] flex flex-col" style={{ gap: `${pvh(1.2)}px` }}>
                                      <div className="font-bold uppercase tracking-widest text-center" style={{ fontSize: `${pvh(1.3)}px`, opacity: 0.5, marginBottom: `${pvh(0.5)}px` }}>Próximos Dias</div>
                                      {liveWeather.daily.slice(1, 4).map((d, i) => (
                                        <div key={i} className={`w-full flex items-center cenario-anim-row-${i + 1}`} style={{
                                          padding: `${pvh(1.2)}px ${pvh(2)}px`,
                                          background: "rgba(255,255,255,0.08)",
                                          borderRadius: `${pvh(1.8)}px`,
                                          backdropFilter: "blur(20px)",
                                          border: "1.5px solid rgba(255,255,255,0.15)",
                                          boxShadow: "0 8px 30px rgba(0,0,0,0.15)",
                                          gap: `${pvh(1)}px`,
                                        }}>
                                          <div style={{ width: `${pvh(10)}px`, flexShrink: 0, display: "flex", alignItems: "center" }}>
                                            <span className="font-bold capitalize block truncate" style={{ fontSize: `${pvh(1.7)}px`, lineHeight: 1 }}>
                                              {new Date(d.date + "T12:00").toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" }).replace('.', '')}
                                            </span>
                                          </div>
                                          <div style={{ width: `${pvh(4.5)}px`, height: `${pvh(4.5)}px`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                            <WeatherIcon code={d.code} size={pvh(4.2)} forceDay />
                                          </div>
                                          <div className="flex-1" style={{ minWidth: 0, display: "flex", alignItems: "center", paddingLeft: `${pvh(1)}px` }}>
                                            <div className="flex flex-col" style={{ gap: `${pvh(0.3)}px` }}>
                                              <div className="flex items-center" style={{ gap: `${pvh(0.5)}px`, fontSize: `${pvh(1.2)}px`, lineHeight: 1 }}>
                                                <Droplets size={pvh(1.2)} style={{ color: "var(--layout-accent-color, #7dd3fc)" }} />
                                                <span className="font-bold" style={{ color: "var(--layout-accent-color, #7dd3fc)" }}>{d.humidity}%</span>
                                              </div>
                                              <div className="flex items-center" style={{ gap: `${pvh(0.5)}px`, fontSize: `${pvh(1.2)}px`, lineHeight: 1 }}>
                                                <CloudRain size={pvh(1.2)} style={{ color: "rgba(255,255,255,0.7)" }} />
                                                <span className="font-bold" style={{ color: "rgba(255,255,255,0.7)" }}>{d.rainMm ?? 0}mm</span>
                                              </div>
                                            </div>
                                          </div>
                                          <div style={{ width: `${pvh(8)}px`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                                            <div className="flex flex-col items-end" style={{ gap: `${pvh(0.1)}px`, justifyContent: "center" }}>
                                              <span className="font-black tabular-nums" style={{ fontSize: `${pvh(2.6)}px`, lineHeight: 1 }}>{d.max}°</span>
                                              <span className="font-bold tabular-nums" style={{ fontSize: `${pvh(1.3)}px`, opacity: 0.5, lineHeight: 1 }}>{d.min}°</span>
                                            </div>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              )}
                            </>) : (
                              <div className="flex-1 flex items-center justify-center opacity-50" style={{ fontSize: `${pvh(1.8)}px` }}>
                                {weatherCity ? "Carregando..." : "Configure uma cidade"}
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ═══ TRAFFIC ═══ */}
                      {activeTab === "traffic" && (
                        <div className="absolute inset-0 flex flex-col items-center justify-end" style={{ padding: `${pvh(3)}px`, pointerEvents: "none" }}>
                          {config.traffic.enabled && trafficCoords ? (
                            <div className="flex items-center rounded-2xl" style={{ padding: `${pvh(1.2)}px ${pvh(3)}px`, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.12)", marginBottom: `${pvh(4)}px`, boxShadow: "0 8px 32px rgba(0,0,0,0.3)" }}>
                              <Car style={{ width: `${pvh(2.5)}px`, height: `${pvh(2.5)}px`, color: "var(--layout-accent-color, #444)", marginRight: `${pvh(1)}px` }} />
                              <span className="font-black" style={{ fontSize: `${pvh(2.4)}px`, color: "#fff", letterSpacing: "-0.01em" }}>{config.traffic.city || config.city || "Trânsito"}</span>
                            </div>
                          ) : (
                            <div className="opacity-50" style={{ color: "#333", fontSize: `${pvh(1.8)}px` }}>Trânsito desativado</div>
                          )}
                        </div>
                      )}

                      {/* ═══ CURRENCY ═══ */}
                      {activeTab === "currency" && (
                        <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ color: config.home.colorMusicName || "#fff" }}>
                          {config.currency.bgImage && <div className="absolute inset-0" style={{ background: "rgba(3,8,14,0.5)" }} />}
                          {!config.currency.bgImage && <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, #080c14 0%, #0f1923 30%, #141e2e 60%, #0d1520 100%)" }} />}
                          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.04) 0%, transparent 60%)" }} />
                          <div className="relative z-10 flex flex-col h-full items-center justify-center" style={{ padding: `${pvh(4)}px`, paddingLeft: `calc(${pvh(4)}px + 50px)` }}>
                            {config.currency.enabled ? (
                              <CenarioQuotesPanel
                                accentColor={config.home.colorMusicTitle || "var(--layout-accent-color, #00BFF0)"}
                                currencyOptions={CURRENCY_OPTIONS}
                                currencySubTab={currencySubTab}
                                currencyCodes={config.currency.currencies}
                                liveCurrencies={liveCurrencies}
                                liveStocks={liveStocks}
                                loadingCurrencies={currencyLoading}
                                loadingStocks={stocksLoading}
                                size={pvh}
                              />
                            ) : (
                              <div className="flex-1 flex items-center justify-center opacity-70" style={{ fontSize: `${pvh(1.9)}px` }}>Cotação desativada</div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* ═══ CHAT ═══ */}
                      {activeTab === "chat" && (
                        <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ color: config.home.colorMusicName || "#fff" }}>
                          {!config.chat.bgImage && <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 100%)" }} />}
                          <div className="absolute bottom-0 left-0 right-0 h-1/4" style={{ background: "linear-gradient(to top, rgba(200,230,0,0.1), transparent)" }} />
                          <div className="relative z-10 flex flex-col h-full" style={{ padding: `${pvh(3)}px` }}>
                            {config.chat.enabled ? (
                              <div className="flex-1 flex flex-col items-center justify-center relative">
                                {/* Header for Chat */}
                                <div className="absolute top-0 right-0 flex flex-col items-end">
                                  <div className="flex items-center gap-2 mb-1">
                                    <MessageCircle size={pvh(3.5)} className="drop-shadow-lg" style={{ color: "var(--layout-accent-color, #444)" }} />
                                    <div className="font-extrabold leading-tight" style={{ fontSize: `${pvh(3.5)}px`, textShadow: "0 2px 10px rgba(0,0,0,1)" }}>mensagens</div>
                                  </div>
                                  <div className="font-bold uppercase tracking-[0.2em]" style={{ fontSize: `${pvh(1.8)}px`, color: "var(--layout-accent-color, #444)" }}>chat ao vivo</div>
                                </div>

                                {/* Last 3 Messages List Preview */}
                                <div className="w-full flex flex-col items-center justify-center gap-6" style={{ padding: `0 ${pvh(4)}px` }}>
                                  {chatMessages.length > 0 ? chatMessages.slice(-3).map((m, i) => (
                                    <div
                                      key={i}
                                      className="flex items-center gap-4 w-full rounded-[2vh] animate-fade-in"
                                      style={{
                                        background: 'rgba(0, 0, 0, 0.4)',
                                        backdropFilter: 'blur(10px)',
                                        WebkitBackdropFilter: 'blur(10px)',
                                        padding: `${pvh(2.5)}px`,
                                        border: '1px solid rgba(255, 255, 255, 0.05)',
                                        boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
                                        animation: `cenario-chat-enter 0.6s cubic-bezier(0.16, 1, 0.3, 1) both ${i * 0.1}s`
                                      }}
                                    >
                                      {/* User Avatar */}
                                      <div 
                                        className="rounded-full flex items-center justify-center flex-shrink-0 border-2"
                                        style={{ 
                                          width: pvh(6), 
                                          height: pvh(6), 
                                          background: "rgba(255,255,255,0.1)", 
                                          borderColor: "var(--layout-accent-color, #444)"
                                        }}
                                      >
                                        <span className="font-bold" style={{ fontSize: pvh(2.5), color: '#fff' }}>
                                          {m.user.charAt(0).toUpperCase()}
                                        </span>
                                      </div>

                                      <div className="flex flex-col min-w-0">
                                        <div 
                                          className="font-black uppercase tracking-wider mb-0.5 truncate" 
                                          style={{ fontSize: `${pvh(1.6)}px`, color: "var(--layout-accent-color, #444)" }}
                                        >
                                          {m.user}
                                        </div>
                                        <div 
                                          className="font-bold leading-tight" 
                                          style={{ fontSize: `${pvh(2.2)}px`, color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.3)' }}
                                        >
                                          {m.text}
                                        </div>
                                      </div>
                                    </div>
                                  )) : (
                                    <div className="opacity-50 text-xs">Aguardando mensagens do chat...</div>
                                  )}
                                </div>
                                <style>{`
                                  @keyframes cenario-chat-enter {
                                    0% { opacity: 0; transform: translateY(20px) scale(0.95); }
                                    100% { opacity: 1; transform: translateY(0) scale(1); }
                                  }
                                `}</style>
                              </div>
                            ) : (
                              <div className="flex-1 flex items-center justify-center opacity-50" style={{ fontSize: `${pvh(1.8)}px` }}>Chat desativado</div>
                            )}
                          </div>
                        </div>
                      )}

                      </div>{/* end animated page wrapper */}
                    </div>
                  </div>
                </div>
              </div>

              {/* Drawing options panel for preview */}
              {previewDrawActive && showPreviewDrawOptions && (
                <div className="absolute flex flex-col items-center gap-1 rounded-xl" style={{ left: 60, top: "50%", transform: "translateY(-50%)", zIndex: 45, padding: "6px 4px", background: "rgba(20,20,20,0.85)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.15)" }}>
                  {PREV_DRAW_COLORS.map(c => (
                    <button key={c} onClick={() => setPreviewDrawColor(c)} className="rounded-full cursor-pointer" style={{ width: 18, height: 18, background: c, border: previewDrawColor === c ? "2px solid #fff" : "2px solid transparent", boxShadow: previewDrawColor === c ? `0 0 6px ${c}` : "none", transition: "all 0.15s ease" }} />
                  ))}
                  <div style={{ width: "100%", height: 1, background: "rgba(255,255,255,0.15)", margin: "2px 0" }} />
                  {PREV_DRAW_WIDTHS.map(w => (
                    <button key={w} onClick={() => setPreviewDrawWidth(w)} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: 18, height: 18, background: previewDrawWidth === w ? "rgba(255,255,255,0.2)" : "transparent", border: previewDrawWidth === w ? "1px solid rgba(255,255,255,0.4)" : "1px solid transparent", transition: "all 0.15s ease" }}>
                      <div style={{ width: Math.max(3, w * 1.2), height: Math.max(3, w * 1.2), borderRadius: "50%", background: previewDrawColor }} />
                    </button>
                  ))}
                </div>
              )}

              {/* Shapes panel */}
              {previewDrawActive && showShapesPanel && (
                <div className="absolute flex flex-row items-center gap-1 rounded-xl" style={{ left: 60, top: "65%", transform: "translateY(-50%)", zIndex: 45, padding: "6px", background: "rgba(20,20,20,0.85)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.15)" }}>
                  {SHAPE_OPTIONS.map(s => {
                    const Icon = s.icon;
                    return (
                      <button key={s.id} onClick={() => { setSelectedShape(s.id); setPreviewDrawMode("shape"); }} className="rounded-lg flex items-center justify-center cursor-pointer" style={{ width: 28, height: 28, background: selectedShape === s.id ? "rgba(128,128,128,0.25)" : "rgba(255,255,255,0.08)", border: selectedShape === s.id ? "1px solid rgba(225,245,50,0.5)" : "1px solid transparent", transition: "all 0.15s ease" }} title={s.label}>
                        <Icon size={14} style={{ color: previewDrawColor }} />
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Drawing canvas overlay for preview — always mounted for remote sync */}
              <canvas
                ref={previewCanvasRef}
                className="absolute rounded-2xl"
                style={{ top: 0, bottom: 0, right: 0, left: 52, zIndex: 40, cursor: previewDrawActive ? (previewDrawMode === "eraser" ? "cell" : "crosshair") : "default", touchAction: previewDrawActive ? "none" : "auto", pointerEvents: previewDrawActive ? "auto" : "none" }}
                onMouseDown={handlePreviewDrawStart}
                onMouseMove={handlePreviewDrawMove}
                onMouseUp={(e) => handlePreviewDrawEnd(e)}
                onMouseLeave={() => { previewIsDrawingRef.current = false; setShapeStartPos(null); const canvas = previewCanvasRef.current; if (canvas) { const ctx = canvas.getContext("2d"); if (ctx) ctx.globalCompositeOperation = "source-over"; } }}
                onTouchStart={handlePreviewDrawStart}
                onTouchMove={handlePreviewDrawMove}
                onTouchEnd={(e) => handlePreviewDrawEnd(e)}
              />

              {/* Clear drawing button for preview */}
              {previewHasDrawing && (
                <button onClick={clearPreviewDrawing} className="absolute flex items-center justify-center rounded-full" style={{ top: 8, right: 8, zIndex: 45, width: 24, height: 24, background: "rgba(239,68,68,0.8)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.2)", cursor: "pointer" }}>
                  <Eraser size={12} color="white" />
                </button>
              )}

              {!config.weather.enabled && !config.traffic.enabled && !config.currency.enabled && !config.chat.enabled && !config.home.bgImage && (
                <div className="absolute inset-0 flex items-center justify-center text-center" style={{ background: "rgba(26,26,26,0.85)" }}>
                  <div className="text-white opacity-50">
                    <MonitorPlay size={28} className="mx-auto mb-2" />
                    <div className="text-[10px]">Ative os módulos para visualizar</div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
  );
}
