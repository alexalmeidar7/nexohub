import { useState, useRef, useEffect, useCallback } from "react";
import { MonitorPlay, CloudSun, Car, DollarSign, MessageCircle, Trash2, Eye, EyeOff, Settings, Home, MapPin, Satellite, Sun, CalendarDays, Search, Upload, Image, Clock, Loader2, Droplets, Wind, Thermometer, ExternalLink, TrendingUp, TrendingDown, Minus, Plus, ChevronUp, ChevronDown, Pen, Eraser, Wifi, WifiOff, RefreshCw, Palette, Undo2, Shapes, Square, Circle, Triangle, ArrowUp, ArrowRight, ArrowDown, ArrowLeft, Star, Hexagon, Diamond, Music, Mic, RotateCw, Play } from "lucide-react";
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

/* ─── types ─── */
interface WeatherConfig {
  enabled: boolean;
  showCurrent: boolean;
  showForecast3Days: boolean;
  showSatellite: boolean;
  city: string;
  bgImage: string;
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
}

interface CenarioConfig {
  city: string;
  useProgramThumbAsBg?: boolean;
  bgAlternateMode?: boolean;
  home: HomeConfig;
  weather: WeatherConfig;
  traffic: TrafficConfig;
  currency: CurrencyConfig;
  chat: ChatConfig;
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
  home: { bgImage: "" },
  weather: { enabled: true, showCurrent: true, showForecast3Days: true, showSatellite: false, city: "", bgImage: "" },
  traffic: { enabled: false, city: "", points: [], bgImage: "", lat: null, lon: null, zoom: 13 },
  currency: { enabled: true, currencies: ["USD", "EUR"], bgImage: "" },
  chat: { enabled: false, youtubeVideoUrl: "", bgImage: "" },
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

const mockMessages = [
  { user: "João Silva", text: "Boa tarde! 🎉" },
  { user: "Maria", text: "Excelente programa hoje!" },
  { user: "Carlos", text: "Manda salve pra galera!" },
];

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
      <Button
        type="button"
        size="sm"
        onClick={handleSave}
        disabled={!dirty}
        className="h-7 px-3 text-xs"
      >
        Salvar
      </Button>
    </div>
  );
}

/* ─── COMPONENT ─── */
/* eslint-disable @typescript-eslint/no-unused-vars */
export default function CenarioInterativoPage() {
  const { user } = useAuth();
  const [config, setConfig] = useState<CenarioConfig>(defaultConfig);
  const [activeTab, setActiveTab] = useState("home");
  const [weatherSubTab, setWeatherSubTab] = useState("today");
  const [currencySubTab, setCurrencySubTab] = useState<"moedas" | "bolsas">("moedas");
  const [satelliteZoom, setSatelliteZoom] = useState(6);

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
  const [previewZoom, setPreviewZoom] = useState(0.6); // Default preview zoom level
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
      if (payload && typeof payload.zoom === "number") setSatelliteZoom(payload.zoom);
    }).on("broadcast", { event: "config-update" }, ({ payload }: any) => {
      if (payload?.config && typeof payload.config === "object") {
        setConfig(prev => ({ ...prev, ...(payload.config as Partial<CenarioConfig>) }));
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
  const lastPongRef = useRef(0);
  const presenceConnectedRef = useRef(false);
  const presenceShownRef = useRef(false);
  const previewIsLandscape = externalRotation === 90 || externalRotation === 270;

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
  }, [previewIsLandscape, previewZoom]);

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
        setSatelliteZoom(ev.data.zoom);
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
    setActiveTab(tab);
    cenarioBcRef.current?.postMessage({ type: "tab-change", tab, subTab: weatherSubTab, currencySubTab });
    rtDrawChannelRef.current?.send({ type: "broadcast", event: "tab-change", payload: { tab, subTab: weatherSubTab, currencySubTab } });
  };
  const handleWeatherSubTabChange = (sub: string) => {
    setWeatherSubTab(sub);
    cenarioBcRef.current?.postMessage({ type: "tab-change", tab: "weather", subTab: sub, currencySubTab });
    rtDrawChannelRef.current?.send({ type: "broadcast", event: "tab-change", payload: { tab: "weather", subTab: sub, currencySubTab } });
  };
  const handleCurrencySubTabChange = (sub: "moedas" | "bolsas") => {
    setCurrencySubTab(sub);
    cenarioBcRef.current?.postMessage({ type: "tab-change", tab: "currency", subTab: weatherSubTab, currencySubTab: sub });
    rtDrawChannelRef.current?.send({ type: "broadcast", event: "tab-change", payload: { tab: "currency", subTab: weatherSubTab, currencySubTab: sub } });
  };
  const [trafficSearchCity, setTrafficSearchCity] = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const savedFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentProgram, setCurrentProgram] = useState<{ nome: string; id: string; selo?: string | null; horario_inicio: string; horario_fim: string; apresentador?: string; apresentadorFoto?: string; apresentadoresFotos?: string[]; tipo_programa?: string | null; thumb?: string | null; capa?: string | null } | null>(null);
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

  /* ─── Fetch artist background from Deezer ─── */
  const exceptionWordsList = (config.home.exceptionWords || "break,vinhetas,hora certa").split(",").map(w => w.trim().toLowerCase()).filter(Boolean);
  const isBreakTrack = (() => {
    const titulo = (musicData?.titulo || "").toLowerCase();
    const artista = (musicData?.artista || "").toLowerCase();
    return exceptionWordsList.some(w => titulo === w || artista === w || titulo.includes(w) || artista.includes(w));
  })();
  useEffect(() => {
    if (isBreakTrack) { setArtistBgUrl(null); setPrevArtistBgUrl(null); setArtistBgReady(false); return; }
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
  }, [musicData?.artista, isBreakTrack]);

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
    if (!user?.id) return;
    const key = `masterview_music_data::${user.id}`;
    const poll = setInterval(() => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return;
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
    if (!user?.id) return;
    const load = async () => {
      const now = new Date();
      const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
      const today = dayNames[now.getDay()];
      const nowTime = now.toTimeString().slice(0, 5);

      const { data: progs } = await supabase
        .from("programas")
        .select("id, nome, horario_inicio, horario_fim, dias_semana, selo, thumb, capa, apresentador_id, apresentadores_ids, tipo_programa")
        .eq("user_id", user.id)
        .eq("ativo", true)
        .ilike("estudio", "%fm%");

      const onAir = progs?.find(p => {
        const dias = p.dias_semana || [];
        return dias.includes(today) && p.horario_inicio <= nowTime && p.horario_fim > nowTime;
      });

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
        setCurrentProgram({ nome: onAir.nome, id: onAir.id, selo: onAir.selo, thumb: (onAir as any).thumb || null, capa: (onAir as any).capa || null, horario_inicio: onAir.horario_inicio, horario_fim: onAir.horario_fim, apresentador: apresentadorNome, apresentadorFoto, apresentadoresFotos, tipo_programa: onAir.tipo_programa });
        const { data: logos } = await supabase
          .from("logos_patrocinadores")
          .select("id, nome, logo_url")
          .eq("programa_id", onAir.id)
          .eq("user_id", user.id)
          .eq("ativo", true)
          .eq("excluido", false);
        setSponsorLogos(logos || []);
        // Find next program
        const upcoming = progs?.filter(p => (p.dias_semana || []).includes(today) && p.horario_inicio > nowTime).sort((a, b) => a.horario_inicio.localeCompare(b.horario_inicio));
        if (upcoming?.length) {
          const np = upcoming[0];
          setNextProgram({ nome: np.nome, selo: np.selo, horario_inicio: np.horario_inicio, horario_fim: np.horario_fim });
        } else {
          setNextProgram(null);
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
  }, [user?.id]);

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

      if ((data as any)?.cenario_config && typeof (data as any).cenario_config === "object") {
        const savedConfig = (data as any).cenario_config as Partial<CenarioConfig> & {
          _activeTab?: string;
          _weatherSubTab?: string;
          _currencySubTab?: "moedas" | "bolsas";
          _screenRotation?: number;
        };
        const merged = { ...defaultConfig, ...savedConfig };
        setConfig(merged);
        if (savedConfig._activeTab) setActiveTab(savedConfig._activeTab);
        if (savedConfig._weatherSubTab) setWeatherSubTab(savedConfig._weatherSubTab);
        if (savedConfig._currencySubTab) setCurrencySubTab(savedConfig._currencySubTab);
        if (typeof savedConfig._screenRotation === "number") setExternalRotation(savedConfig._screenRotation);
        try {
          localStorage.setItem("cenario_interativo_config_cache_v1", JSON.stringify(merged));
        } catch {
          // silent
        }
      } else {
        applyCachedConfig();
      }

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
    rtDrawChannelRef.current?.send({ type: "broadcast", event: "config-update", payload: { config } });
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
        }
      } catch { /* silent */ }
    }, 1000);
    return () => { if (trafficGeoRef.current) clearTimeout(trafficGeoRef.current); };
  }, [config.traffic.enabled, trafficCity, config.traffic.lat, config.traffic.lon]);

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSaveRef = useRef<string>("");
  const pendingSaveRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    if (!user?.id || !loaded) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    const configWithTabs = {
      ...config,
      _activeTab: activeTab,
      _weatherSubTab: weatherSubTab,
      _currencySubTab: currencySubTab,
      _screenRotation: externalRotation,
    };
    const serialized = JSON.stringify(configWithTabs);
    if (serialized === prevSaveRef.current) { pendingSaveRef.current = null; return; }
    const doSave = async () => {
      prevSaveRef.current = serialized;
      pendingSaveRef.current = null;
      setSaving(true);
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
      }
      setSaving(false);
    };
    pendingSaveRef.current = doSave;
    saveTimeout.current = setTimeout(doSave, 800);
    return () => {
      if (saveTimeout.current) clearTimeout(saveTimeout.current);
      // Flush pending save on unmount so data is never lost
      if (pendingSaveRef.current) { pendingSaveRef.current(); }
    };
  }, [config, user?.id, loaded, activeTab, weatherSubTab, currencySubTab, externalRotation]);

  const updateHome = (partial: Partial<HomeConfig>) =>
    setConfig(c => ({ ...c, home: { ...c.home, ...partial } }));
  const updateWeather = (partial: Partial<WeatherConfig>) =>
    setConfig(c => ({ ...c, weather: { ...c.weather, ...partial } }));
  const updateTraffic = (partial: Partial<TrafficConfig>) =>
    setConfig(c => ({ ...c, traffic: { ...c.traffic, ...partial } }));
  const updateCurrency = (partial: Partial<CurrencyConfig>) =>
    setConfig(c => ({ ...c, currency: { ...c.currency, ...partial } }));
  const updateChat = (partial: Partial<ChatConfig>) =>
    setConfig(c => ({ ...c, chat: { ...c.chat, ...partial } }));

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
  }, []);

  const removeTrafficPoint = (id: string) =>
    updateTraffic({ points: config.traffic.points.filter(p => p.id !== id) });

  const toggleCurrency = (code: string) => {
    const has = config.currency.currencies.includes(code);
    updateCurrency({ currencies: has ? config.currency.currencies.filter(c => c !== code) : [...config.currency.currencies, code] });
  };

  const handleTrafficSearch = () => {
    if (!trafficSearchCity.trim()) return;
    // Reset lat/lon so geocoding will run for the new city
    updateTraffic({ city: trafficSearchCity.trim(), lat: null, lon: null });
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

  return (
    <div className="animate-fade-in space-y-5">
      <div className="rounded-2xl overflow-hidden" style={pageStyle}>
        <div className="px-6 py-4 flex items-center gap-3" style={headerStyle}>
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: "rgba(255,255,255,0.15)" }}>
            <MonitorPlay size={18} />
          </div>
          <div>
            <h3 className="text-base font-bold drop-shadow-sm">Cenário Interativo</h3>
            <p className="text-xs drop-shadow-sm" style={{ opacity: 0.8 }}>Configure os elementos do cenário para suas transmissões</p>
          </div>
        </div>

        <div className="p-5 flex flex-col lg:flex-row gap-6" style={{ color: textColor }}>

          {/* ── LEFT: Configuration ── */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <Settings size={16} style={{ color: mutedText }} />
              <span className="text-sm font-semibold">Configuração</span>
              <div className="flex items-center gap-2 ml-auto">
                {saving && <span className="text-[10px] animate-pulse" style={{ color: mutedText }}>Salvando...</span>}
                {!saving && savedFlash && <span className="text-[10px]" style={{ color: mutedText }}>✓ Salvo</span>}
              </div>
            </div>

            <Tabs value={activeTab} onValueChange={handleTabChange}>
              <TabsList className="w-full grid grid-cols-5 mb-4" style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)" }}>
                <TabsTrigger value="home" className="text-xs gap-1 data-[state=active]:shadow-sm"><Home size={14} /> Home</TabsTrigger>
                <TabsTrigger value="weather" className="text-xs gap-1 data-[state=active]:shadow-sm"><CloudSun size={14} /> Tempo</TabsTrigger>
                <TabsTrigger value="traffic" className="text-xs gap-1 data-[state=active]:shadow-sm"><Car size={14} /> Trânsito</TabsTrigger>
                <TabsTrigger value="currency" className="text-xs gap-1 data-[state=active]:shadow-sm"><DollarSign size={14} /> Cotação</TabsTrigger>
                <TabsTrigger value="chat" className="text-xs gap-1 data-[state=active]:shadow-sm"><MessageCircle size={14} /> Chat</TabsTrigger>
              </TabsList>

              {/* ═══ Home ═══ */}
              <TabsContent value="home" className="space-y-5 animate-in fade-in-50 duration-500">
                <div className="flex flex-col gap-5">
                  {/* Status do Programa no Ar */}
                  <div className="relative overflow-hidden rounded-xl border p-4 transition-all" 
                       style={{ 
                         background: "color-mix(in srgb, var(--layout-header-bg, #0d0446) 3%, var(--layout-page-bg, #ffffff))",
                         borderColor: "color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)"
                       }}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                          <Clock size={16} />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold leading-none">Programa no ar</h4>
                          <p className="text-[10px] opacity-60 mt-1 uppercase tracking-wider font-semibold">Monitoramento em tempo real</p>
                        </div>
                      </div>
                      {currentProgram && (
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/10 text-green-600 text-[10px] font-bold border border-green-500/20">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                          </span>
                          AO VIVO
                        </div>
                      )}
                    </div>

                    {currentProgram ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 rounded-lg overflow-hidden border border-white/20 bg-muted shrink-0">
                            <img 
                              src={currentProgram.thumb || currentProgram.capa || "https://images.unsplash.com/photo-1478737270239-2fccd27ee086?w=100&h=100&fit=crop"} 
                              className="h-full w-full object-cover"
                              alt={currentProgram.nome}
                            />
                          </div>
                          <div>
                            <div className="text-sm font-extrabold line-clamp-1">{currentProgram.nome}</div>
                            <div className="text-xs opacity-70 flex items-center gap-1 mt-0.5">
                              <CalendarDays size={10} />
                              {currentProgram.horario_inicio} às {currentProgram.horario_fim}
                            </div>
                          </div>
                        </div>

                        {sponsorLogos.length > 0 && (
                          <div className="pt-3 border-t border-dashed border-black/5 dark:border-white/5">
                            <p className="text-[10px] font-bold opacity-50 mb-2 uppercase tracking-tighter">Patrocinadores vinculados</p>
                            <div className="flex flex-wrap gap-2">
                              {sponsorLogos.map(l => (
                                <div key={l.id} className="group relative flex items-center gap-2 rounded-lg pl-1 pr-3 py-1 text-xs border transition-all hover:bg-white/50" 
                                     style={{ background: "white", borderColor: "rgba(0,0,0,0.05)" }}>
                                  {l.logo_url ? (
                                    <img src={l.logo_url} alt={l.nome} className="w-6 h-6 object-contain rounded-md bg-white p-0.5" />
                                  ) : (
                                    <div className="w-6 h-6 rounded-md bg-muted flex items-center justify-center text-[8px] font-bold">L</div>
                                  )}
                                  <span className="font-semibold text-[11px] truncate max-w-[100px]">{l.nome}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="py-4 flex flex-col items-center justify-center text-center rounded-lg border-2 border-dashed border-black/5 bg-black/5">
                        <MonitorPlay size={24} className="opacity-20 mb-2" />
                        <span className="text-xs font-semibold opacity-40">Nenhum programa detectado no Estúdio FM</span>
                      </div>
                    )}
                  </div>

                  {/* Configurações Visuais */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Imagem de Fundo Estática */}
                    <div className="flex flex-col gap-3 p-4 rounded-xl border bg-white/40" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333) 10%, transparent)" }}>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="p-1.5 rounded-lg bg-blue-500/10 text-blue-600">
                          <Image size={16} />
                        </div>
                        <h4 className="text-xs font-bold uppercase tracking-wider">Fundo Estático</h4>
                      </div>
                      <BgImageUpload value={config.home.bgImage} onChange={v => updateHome({ bgImage: v })} mutedText={mutedText} userId={uid} category="home" />
                    </div>

                    {/* Fundo em Degradê */}
                    <div className="flex flex-col gap-3 p-4 rounded-xl border bg-white/40" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333) 10%, transparent)" }}>
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-purple-500/10 text-purple-600">
                            <Palette size={16} />
                          </div>
                          <h4 className="text-xs font-bold uppercase tracking-wider">Cores Degradê</h4>
                        </div>
                        <Switch checked={!!config.home.bgGradient} onCheckedChange={v => updateHome({ bgGradient: v })} className="scale-75" />
                      </div>
                      
                      {config.home.bgGradient ? (
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
                      ) : (
                        <div className="flex-1 flex items-center justify-center border-2 border-dashed border-black/5 rounded-lg">
                          <span className="text-[10px] font-medium opacity-30">Degradê desativado</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Opções Avançadas de Fundo */}
                  <div className="space-y-0 overflow-hidden rounded-xl border" style={{ borderColor: "color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)" }}>
                    <div className="px-4 py-3 bg-black/5 border-b border-black/5">
                      <h4 className="text-[11px] font-bold uppercase tracking-widest opacity-60">Comportamento do Fundo</h4>
                    </div>
                    
                    <div className="divide-y divide-black/5 bg-white/20">
                      {/* Alternar entre artista e thumb */}
                      <div className="p-4 flex items-center justify-between gap-4 transition-colors hover:bg-black/5">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="p-1 rounded-md bg-amber-500/10 text-amber-600">
                              <RefreshCw size={14} />
                            </div>
                            <Label className="text-xs font-bold">Modo Alternância Inteligente</Label>
                          </div>
                          <p className="text-[10px] leading-relaxed opacity-60">Intercala automaticamente entre a capa do artista (Deezer) e a thumb do programa a cada 10 segundos.</p>
                        </div>
                        <Switch
                          checked={!!config.bgAlternateMode}
                          onCheckedChange={v => setConfig(c => ({ ...c, bgAlternateMode: v }))}
                        />
                      </div>

                      {/* Thumb do programa global */}
                      <div className="p-4 flex items-center justify-between gap-4 transition-colors hover:bg-black/5">
                        <div className="flex-1 space-y-1">
                          <div className="flex items-center gap-2">
                            <div className="p-1 rounded-md bg-indigo-500/10 text-indigo-600">
                              <Shapes size={14} />
                            </div>
                            <Label className="text-xs font-bold">Thumb como Fundo Global</Label>
                          </div>
                          <p className="text-[10px] leading-relaxed opacity-60">Aplica a thumb do programa em todas as abas (Home, Tempo, Cotação e Chat).</p>
                        </div>
                        <Switch
                          checked={!!config.useProgramThumbAsBg}
                          onCheckedChange={v => setConfig(c => ({ ...c, useProgramThumbAsBg: v }))}
                        />
                      </div>

                      {/* Palavras de Exceção */}
                      <div className="p-4 space-y-3 transition-colors hover:bg-black/5">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="p-1 rounded-md bg-rose-500/10 text-rose-600">
                              <EyeOff size={14} />
                            </div>
                            <Label className="text-xs font-bold">Filtro de Exceções</Label>
                          </div>
                        </div>
                        <div className="space-y-2 pl-7">
                          <p className="text-[10px] leading-relaxed opacity-60">
                            Quando o título ou artista contiver estas palavras, o fundo mudará para o degradê padrão (ideal para vinhetas e breaks).
                          </p>
                          <ExceptionWordsInput value={config.home.exceptionWords || ""} onSave={v => updateHome({ exceptionWords: v })} />
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
                  <>
                    <div className="flex gap-1 rounded-lg p-1" style={{ background: subTabBg }}>
                      {[
                        { key: "today", label: "Hoje", icon: <Sun size={13} /> },
                        { key: "forecast", label: "3 Dias", icon: <CalendarDays size={13} /> },
                        { key: "satellite", label: "Satélite", icon: <Satellite size={13} /> },
                      ].map(t => (
                        <button
                          key={t.key}
                          onClick={() => handleWeatherSubTabChange(t.key)}
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
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Exibir tempo atual completo</Label>
                          <Switch checked={config.weather.showCurrent} onCheckedChange={v => updateWeather({ showCurrent: v })} />
                        </div>
                        <div>
                          <Label className="text-xs mb-1 block" style={{ color: mutedText }}>Cidade (ou use a cidade principal)</Label>
                          <Input placeholder={config.city || "Ex: São Paulo"} value={config.weather.city} onChange={e => updateWeather({ city: e.target.value })} className="text-sm" style={{ color: textColor, background: "var(--layout-page-bg, #ffffff)" }} />
                        </div>
                        {weatherLoading && (
                          <div className="flex items-center gap-2 text-xs" style={{ color: mutedText }}>
                            <Loader2 size={14} className="animate-spin" /> Carregando dados...
                          </div>
                        )}
                        {!weatherLoading && liveWeather && (
                          <div className="rounded-lg p-3 space-y-2" style={{ background: subTabBg }}>
                            <div className="flex items-center gap-3">
                              <span className="text-3xl">{getWIcon(liveWeather.current.code)}</span>
                              <div>
                                <div className="text-2xl font-bold">{liveWeather.current.temp}°C</div>
                                <div className="text-xs" style={{ color: mutedText }}>{getWLabel(liveWeather.current.code)}</div>
                              </div>
                            </div>
                            <div className="flex gap-4 text-xs" style={{ color: mutedText }}>
                              <span className="flex items-center gap-1"><Droplets size={12} /> {liveWeather.current.humidity}%</span>
                              {liveWeather.daily[0] && (
                                <>
                                  <span className="flex items-center gap-1"><Thermometer size={12} /> {liveWeather.daily[0].min}° / {liveWeather.daily[0].max}°</span>
                                  <span>💧 {liveWeather.daily[0].precip}%</span>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                        {!weatherLoading && !liveWeather && weatherCity && (
                          <p className="text-xs" style={{ color: mutedText }}>Cidade não encontrada. Verifique o nome.</p>
                        )}
                      </div>
                    )}

                    {weatherSubTab === "forecast" && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Exibir previsão 3 dias</Label>
                          <Switch checked={config.weather.showForecast3Days} onCheckedChange={v => updateWeather({ showForecast3Days: v })} />
                        </div>
                        {weatherLoading && (
                          <div className="flex items-center gap-2 text-xs" style={{ color: mutedText }}>
                            <Loader2 size={14} className="animate-spin" /> Carregando...
                          </div>
                        )}
                        {!weatherLoading && liveWeather && liveWeather.daily.slice(1, 4).map((day, i) => {
                          const d = new Date(day.date + "T12:00:00");
                          const dayName = d.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });
                          return (
                            <div key={i} className="flex items-center gap-3 rounded-lg px-3 py-2" style={{ background: subTabBg }}>
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
                    )}

                    {weatherSubTab === "satellite" && (
                      <div className="space-y-3">
                        <p className="text-xs" style={{ color: mutedText }}>
                          Exibe imagens de satélite meteorológico da região configurada.
                        </p>
                        <div className="flex items-center justify-between">
                          <Label className="text-sm">Exibir imagens de satélite</Label>
                          <Switch checked={config.weather.showSatellite} onCheckedChange={v => updateWeather({ showSatellite: v })} />
                        </div>
                        <div>
                          <Label className="text-xs mb-1 block" style={{ color: mutedText }}>Cidade para satélite</Label>
                          <Input placeholder="Ex: São Paulo" value={config.weather.city} onChange={e => updateWeather({ city: e.target.value })} className="text-sm" style={{ color: textColor, background: "var(--layout-page-bg, #ffffff)" }} />
                        </div>
                        {config.weather.showSatellite && weatherCoords && (
                          <div className="rounded-lg p-3 text-xs text-center" style={{ background: subTabBg, color: mutedText }}>
                            <Satellite size={16} className="mx-auto mb-1 opacity-60" />
                            O mapa de satélite é exibido no Preview ao lado →
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
                  </>
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
                    <div className="flex gap-2">
                      <Input
                        placeholder="Nome da cidade..."
                        value={trafficSearchCity}
                        onChange={e => setTrafficSearchCity(e.target.value)}
                        onKeyDown={e => e.key === "Enter" && handleTrafficSearch()}
                        className="text-sm flex-1"
                        style={{ color: textColor, background: "var(--layout-page-bg, #ffffff)" }}
                      />
                      <Button size="sm" onClick={handleTrafficSearch} className="gap-1 text-xs" style={{ background: "var(--layout-header-bg, #0d0446)", color: "var(--layout-header-text, #fff)" }}>
                        <Search size={14} /> Buscar
                      </Button>
                    </div>

                    <div className="rounded-lg p-3 text-xs text-center" style={{ background: subTabBg, color: mutedText }}>
                      <Car size={16} className="mx-auto mb-1 opacity-60" />
                      O mapa de trânsito é exibido no Preview ao lado →
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
                            style={{ accentColor: "var(--layout-accent-color, #444)" }}
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

                    {config.traffic.points.length > 0 && (
                      <div className="space-y-2 mt-2">
                        <Label className="text-xs font-medium" style={{ color: mutedText }}>Pontos marcados</Label>
                        {config.traffic.points.map(p => (
                          <div key={p.id} className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: subTabBg }}>
                            <MapPin size={12} style={{ color: mutedText }} />
                            <span className="flex-1 font-medium">{p.label}</span>
                            <button onClick={() => removeTrafficPoint(p.id)} className="opacity-60 hover:opacity-100"><Trash2 size={14} /></button>
                          </div>
                        ))}
                      </div>
                    )}

                    <BgImageUpload value={config.traffic.bgImage} onChange={v => updateTraffic({ bgImage: v })} mutedText={mutedText} userId={uid} category="traffic" />
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

              {/* ═══ Chat ═══ */}
              <TabsContent value="chat" className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">Ativar Chat YouTube Live</Label>
                  <Switch checked={config.chat.enabled} onCheckedChange={v => updateChat({ enabled: v })} />
                </div>
                {config.chat.enabled && (
                  <div className="space-y-3">
                    <Label className="text-xs mb-1 block" style={{ color: mutedText }}>URL do vídeo/live do YouTube</Label>
                    <Input placeholder="https://youtube.com/watch?v=..." value={config.chat.youtubeVideoUrl} onChange={e => updateChat({ youtubeVideoUrl: e.target.value })} className="text-sm" style={{ color: textColor, background: "var(--layout-page-bg, #ffffff)" }} />
                    <BgImageUpload value={config.chat.bgImage} onChange={v => updateChat({ bgImage: v })} mutedText={mutedText} userId={uid} category="chat" />
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>

          {/* ── RIGHT: 9:16 Preview ── */}
          <div className="lg:flex-1 flex flex-col min-w-0" style={{ minHeight: 0 }}>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="flex items-center gap-2">
                <Eye size={16} style={{ color: mutedText }} />
                <span className="text-sm font-semibold whitespace-nowrap">Preview cenário interativo</span>
              </div>
              <div className="flex items-center gap-1.5">
                {externalConnected && (
                  <div className="flex items-center gap-1 px-2 py-0.5 rounded-full" style={{ background: "rgba(74,222,128,0.15)", border: "1px solid rgba(74,222,128,0.3)" }}>
                    <Wifi size={10} style={{ color: "#4ade80" }} />
                    <span className="text-[10px] font-semibold" style={{ color: "#4ade80" }}>Online</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                <button
                  onClick={() => window.open(`/cenario-tela?tab=${activeTab}&weatherSubTab=${weatherSubTab}&uid=${user?.id || ""}`, "_blank")}
                  className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition-opacity hover:opacity-80"
                  style={{ background: "var(--layout-header-bg, #0d0446)", color: "var(--layout-header-text, #fff)" }}
                >
                  <ExternalLink size={11} /> Cenário interativo Externo
                </button>
                <button
                  onClick={() => {
                    setExternalRotation(prev => {
                      const val = (prev + 90) % 360;
                      cenarioBcRef.current?.postMessage({ type: "rotate", angle: val });
                      rtDrawChannelRef.current?.send({ type: "broadcast", event: "rotate", payload: { angle: val } });
                      return val;
                    });
                  }}
                  className="flex items-center gap-1 rounded-lg px-2 py-1.5 text-[10px] font-semibold transition-opacity hover:opacity-80"
                  style={{ background: "var(--layout-header-bg, #0d0446)", color: "var(--layout-header-text, #fff)" }}
                >
                  <RotateCw size={11} /> Rotacionar 90°
                </button>
              </div>
            </div>

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

            <div className="flex flex-col items-center gap-3 w-full pt-4 min-h-0 overflow-hidden">
              {/* Zoom Control */}
              <div className="flex items-center gap-3 px-4 py-2 bg-black/40 backdrop-blur-md rounded-full border border-white/10 shadow-lg z-20">
                <Minus size={14} className="text-white/60 cursor-pointer hover:text-white transition-colors" onClick={() => setPreviewZoom(z => Math.max(0.2, z - 0.1))} />
                <Slider 
                  value={[previewZoom]} 
                  min={0.2} 
                  max={1.0} 
                  step={0.05} 
                  className="w-32 cursor-pointer" 
                  onValueChange={([val]) => setPreviewZoom(val)} 
                />
                <Plus size={14} className="text-white/60 cursor-pointer hover:text-white transition-colors" onClick={() => setPreviewZoom(z => Math.min(1.0, z + 0.1))} />
                <span className="text-[10px] font-mono text-white/80 w-8 text-center">{Math.round(previewZoom * 100)}%</span>
              </div>

              <div className="flex-1 min-h-0 flex items-start justify-center w-full overflow-hidden pb-8">
                <div
                  ref={previewWrapRef}
                  className="relative rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 ease-out"
                  style={{
                    height: "100%",
                    width: "auto",
                    aspectRatio: "9 / 16",
                    boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
                    border: "4px solid rgba(255,255,255,0.12)",
                    background: "#000",
                    transform: `scale(${previewZoom})`,
                    transformOrigin: "top center",
                  }}
                >
                <div className="absolute inset-0 overflow-hidden">
                  {/* Virtual 1080×1920 canvas, scaled to fit — mirrors CenarioTela exactly */}
                  <div style={{ width: PREV_W, height: PREV_H, transform: `scale(${previewScale})`, transformOrigin: "top left", position: "absolute", top: 0, left: 0 }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, display: "flex", fontSize: `${pvh(1.8)}px` }}>

                    {/* Fullscreen background layers */}
                    {activeTab === "weather" && weatherSubTab === "satellite" && config.weather.showSatellite && weatherCoords && (
                      <div className="absolute inset-0" style={{ zIndex: 5 }}>
                        <SatelliteMap lat={weatherCoords.lat} lon={weatherCoords.lon} zoom={satelliteZoom} showControls onZoomChange={(z) => { setSatelliteZoom(z); cenarioBcRef.current?.postMessage({ type: "zoom-change", zoom: z }); rtDrawChannelRef.current?.send({ type: "broadcast", event: "zoom-change", payload: { zoom: z } }); }} />
                      </div>
                    )}
                    {activeTab === "traffic" && config.traffic.enabled && trafficCoords && (
                      <div className="absolute inset-0" style={{ zIndex: 5 }}>
                        <TrafficMap lat={config.traffic.lat ?? trafficCoords.lat} lon={config.traffic.lon ?? trafficCoords.lon} zoom={config.traffic.zoom} interactive onMove={(lat, lon, zoom) => updateTraffic({ lat, lon, zoom })} />
                      </div>
                    )}
                    {!((activeTab === "weather" && weatherSubTab === "satellite" && config.weather.showSatellite) || (activeTab === "traffic" && config.traffic.enabled)) && (() => {
                      const useThumb = !!config.useProgramThumbAsBg && (activeTab === "home" || activeTab === "weather" || activeTab === "currency" || activeTab === "chat");
                      const thumbSrc = currentProgram?.thumb || currentProgram?.capa || "";
                      return (
                        <div className="absolute inset-0" style={{ background: activeTab === "home" ? (config.home.bgGradient ? buildHomeGradient(config.home) : (config.home.bgImage ? "#e8e8e8" : "#000")) : "#e8e8e8", zIndex: 0 }}>
                          {useThumb && thumbSrc && (
                            <>
                              <img src={thumbSrc} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: "blur(18px) brightness(0.55)", transform: "scale(1.1)" }} />
                              <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0.55) 100%)" }} />
                            </>
                          )}
                          {activeTab === "home" && !config.home.bgGradient && config.home.bgImage && <img src={config.home.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                          {activeTab === "weather" && config.weather.bgImage && <img src={config.weather.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                          {activeTab === "traffic" && config.traffic.bgImage && <img src={config.traffic.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
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
                      return (
                        <div className="flex-shrink-0 flex items-center relative" style={{ width: "8%", zIndex: 10, pointerEvents: "none" }}>
                          <div className="flex flex-col items-center" style={{ pointerEvents: "auto", gap: sPad, padding: `${sPad} ${sPad}`, borderRadius: `0 ${pvh(2)}px ${pvh(2)}px 0`, background: isMapTab ? "rgba(18,18,18,0.65)" : "rgba(18,18,18,0.8)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.06)", borderLeft: "none", marginLeft: "-1px", boxShadow: "4px 0 20px rgba(0,0,0,0.3)" }}>
                            <button onClick={() => handleTabChange("home")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: bS, height: bS, background: activeTab === "home" ? "var(--layout-accent-color, rgba(68,68,68,0.85))" : "rgba(255,255,255,0.1)", border: activeTab === "home" ? "2px solid var(--layout-accent-color, #444)" : "2px solid transparent" }}>
                              <Home style={{ width: iS, height: iS }} className="text-white" />
                            </button>
                            <div className="rounded-2xl flex flex-col items-center" style={{ padding: `${pvh(0.4)}px`, background: "rgba(255,255,255,0.06)", opacity: config.weather.enabled ? 1 : 0.35 }}>
                              <button onClick={() => { if (activeTab === "weather") { handleTabChange("home"); } else { handleTabChange("weather"); handleWeatherSubTabChange("today"); } }} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: bS, height: bS, background: activeTab === "weather" ? "var(--layout-accent-color, rgba(68,68,68,0.85))" : "rgba(255,255,255,0.1)", border: activeTab === "weather" ? "2px solid var(--layout-accent-color, #444)" : "2px solid transparent" }}>
                                <CloudSun style={{ width: iS, height: iS }} className="text-white" />
                              </button>
                              <div style={{ overflow: "hidden", maxHeight: activeTab === "weather" ? `${pvh(20)}px` : "0", transition: "max-height 0.35s cubic-bezier(0.4,0,0.2,1)", opacity: activeTab === "weather" ? 1 : 0 }}>
                                <div className="flex flex-col items-center" style={{ gap: `${pvh(0.4)}px`, paddingTop: `${pvh(0.4)}px` }}>
                                  {config.weather.enabled && config.weather.showCurrent && (
                                    <button onClick={() => { handleTabChange("weather"); handleWeatherSubTabChange("today"); }} className="rounded-full flex items-center justify-center text-white font-bold cursor-pointer" style={{ width: sBS, height: sBS, fontSize: sFS, background: activeTab === "weather" && weatherSubTab === "today" ? "rgba(128,128,128,0.25)" : "rgba(255,255,255,0.1)", border: activeTab === "weather" && weatherSubTab === "today" ? "1px solid rgba(225,245,50,0.4)" : "1px solid transparent" }}>1</button>
                                  )}
                                  {config.weather.enabled && config.weather.showForecast3Days && (
                                    <button onClick={() => { handleTabChange("weather"); handleWeatherSubTabChange("forecast"); }} className="rounded-full flex items-center justify-center text-white font-bold cursor-pointer" style={{ width: sBS, height: sBS, fontSize: sFS, background: activeTab === "weather" && weatherSubTab === "forecast" ? "rgba(128,128,128,0.25)" : "rgba(255,255,255,0.1)", border: activeTab === "weather" && weatherSubTab === "forecast" ? "1px solid rgba(225,245,50,0.4)" : "1px solid transparent" }}>2</button>
                                  )}
                                  {config.weather.enabled && config.weather.showSatellite && (
                                    <button onClick={() => { handleTabChange("weather"); handleWeatherSubTabChange("satellite"); }} className="rounded-full flex items-center justify-center text-white font-bold cursor-pointer" style={{ width: sBS, height: sBS, fontSize: sFS, background: activeTab === "weather" && weatherSubTab === "satellite" ? "rgba(128,128,128,0.25)" : "rgba(255,255,255,0.1)", border: activeTab === "weather" && weatherSubTab === "satellite" ? "1px solid rgba(225,245,50,0.4)" : "1px solid transparent" }}>3</button>
                                  )}
                                </div>
                              </div>
                            </div>
                            <button onClick={() => config.traffic.enabled && handleTabChange("traffic")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: bS, height: bS, marginTop: `${pvh(0.3)}px`, background: activeTab === "traffic" ? "var(--layout-accent-color, rgba(68,68,68,0.85))" : "rgba(255,255,255,0.1)", opacity: config.traffic.enabled ? 1 : 0.35, border: activeTab === "traffic" ? "2px solid var(--layout-accent-color, #444)" : "2px solid transparent" }}>
                              <Car style={{ width: iS, height: iS }} className="text-white" />
                            </button>
                            <div className="rounded-2xl flex flex-col items-center" style={{ padding: `${pvh(0.4)}px`, background: "rgba(255,255,255,0.06)", opacity: config.currency.enabled ? 1 : 0.35 }}>
                              <button onClick={() => { if (!config.currency.enabled) return; if (activeTab === "currency") { handleTabChange("home"); } else { handleTabChange("currency"); handleCurrencySubTabChange("moedas"); } }} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: bS, height: bS, background: activeTab === "currency" ? "var(--layout-accent-color, rgba(68,68,68,0.85))" : "rgba(255,255,255,0.1)", border: activeTab === "currency" ? "2px solid var(--layout-accent-color, #444)" : "2px solid transparent" }}>
                                <DollarSign style={{ width: iS, height: iS }} className="text-white" />
                              </button>
                              <div style={{ overflow: "hidden", maxHeight: activeTab === "currency" ? `${pvh(10)}px` : "0", transition: "max-height 0.4s cubic-bezier(0.4,0,0.2,1)", opacity: activeTab === "currency" ? 1 : 0 }}>
                                <div className="flex flex-col items-center" style={{ gap: `${pvh(0.4)}px`, paddingTop: `${pvh(0.4)}px` }}>
                                  <button onClick={() => { handleTabChange("currency"); handleCurrencySubTabChange("moedas"); }} className="rounded-full flex items-center justify-center text-white font-bold cursor-pointer" style={{ width: sBS, height: sBS, fontSize: sFS, background: activeTab === "currency" && currencySubTab === "moedas" ? "rgba(128,128,128,0.25)" : "rgba(255,255,255,0.1)", border: activeTab === "currency" && currencySubTab === "moedas" ? "1px solid rgba(225,245,50,0.4)" : "1px solid transparent" }}>1</button>
                                  <button onClick={() => { handleTabChange("currency"); handleCurrencySubTabChange("bolsas"); }} className="rounded-full flex items-center justify-center text-white font-bold cursor-pointer" style={{ width: sBS, height: sBS, fontSize: sFS, background: activeTab === "currency" && currencySubTab === "bolsas" ? "rgba(128,128,128,0.25)" : "rgba(255,255,255,0.1)", border: activeTab === "currency" && currencySubTab === "bolsas" ? "1px solid rgba(225,245,50,0.4)" : "1px solid transparent" }}>2</button>
                                </div>
                              </div>
                            </div>
                            <button onClick={() => config.chat.enabled && handleTabChange("chat")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: bS, height: bS, background: activeTab === "chat" ? "var(--layout-accent-color, rgba(68,68,68,0.85))" : "rgba(255,255,255,0.1)", opacity: config.chat.enabled ? 1 : 0.35, border: activeTab === "chat" ? "2px solid var(--layout-accent-color, #444)" : "2px solid transparent" }}>
                              <MessageCircle style={{ width: iS, height: iS }} className="text-white" />
                            </button>
                            <button onClick={() => { setPreviewDrawActive(p => { const n = !p; if (!n) { setShowPreviewDrawOptions(false); setShowShapesPanel(false); } else { setPreviewDrawMode("pen"); } return n; }); }} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: bS, height: bS, marginTop: `${pvh(0.3)}px`, background: previewDrawActive ? "rgba(128,128,128,0.25)" : "rgba(255,255,255,0.1)", border: previewDrawActive ? "2px solid var(--layout-accent-color, #444)" : "2px solid transparent" }}>
                              <Pen style={{ width: iS, height: iS }} className="text-white" />
                            </button>
                            {previewDrawActive && (
                              <>
                                <button onClick={() => { setShowPreviewDrawOptions(p => !p); setShowShapesPanel(false); }} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: sBS, height: sBS, background: showPreviewDrawOptions ? "rgba(128,128,128,0.25)" : "rgba(255,255,255,0.1)", border: showPreviewDrawOptions ? "1px solid rgba(225,245,50,0.5)" : "1px solid transparent" }}>
                                  <div style={{ width: `${pvh(1.2)}px`, height: `${pvh(1.2)}px`, borderRadius: "50%", background: previewDrawColor }} />
                                </button>
                                <button onClick={() => setPreviewDrawMode(m => m === "eraser" ? "pen" : "eraser")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: sBS, height: sBS, background: previewDrawMode === "eraser" ? "rgba(128,128,128,0.25)" : "rgba(255,255,255,0.1)", border: previewDrawMode === "eraser" ? "1px solid rgba(225,245,50,0.5)" : "1px solid transparent" }}>
                                  <Eraser size={pvh(1)} className="text-white" />
                                </button>
                                <button onClick={undoLastDraw} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: sBS, height: sBS, background: "rgba(255,255,255,0.12)" }}>
                                  <Undo2 size={pvh(1)} className="text-white" />
                                </button>
                                <button onClick={() => { setShowShapesPanel(p => !p); setShowPreviewDrawOptions(false); if (previewDrawMode !== "shape") { setPreviewDrawMode("shape"); if (!selectedShape) setSelectedShape("arrow-up"); } else { setPreviewDrawMode("pen"); } }} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: sBS, height: sBS, background: previewDrawMode === "shape" ? "rgba(128,128,128,0.25)" : "rgba(255,255,255,0.12)", border: previewDrawMode === "shape" ? "1px solid rgba(225,245,50,0.5)" : "1px solid transparent" }}>
                                  <Shapes size={pvh(1)} className="text-white" />
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
                              let thumbVisible: boolean;
                              let artistVisible: boolean;
                              if (altMode) {
                                if (altBgPhase === "thumb") { thumbVisible = hasThumb; artistVisible = !hasThumb && hasArtist; }
                                else { artistVisible = hasArtist; thumbVisible = !hasArtist && hasThumb; }
                              } else {
                                thumbVisible = !!config.useProgramThumbAsBg && hasThumb;
                                artistVisible = hasArtist;
                              }
                              return (
                                <>
                                  {/* Thumb layer (always mounted for fade) */}
                                  {hasThumb && (
                                    <div className="absolute inset-0" style={{ opacity: thumbVisible ? 1 : 0, transition: "opacity 1.2s ease-in-out" }}>
                                      <img src={thumbSrc} alt="" className="absolute inset-0 w-full h-full object-cover" style={altMode ? undefined : { filter: "blur(18px) brightness(0.55)", transform: "scale(1.1)" }} />
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
                                    <img src={artistBgUrl} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ opacity: artistVisible ? (artistBgReady ? 1 : 0) : 0, filter: "saturate(1.2)", transition: "opacity 1.2s ease-in-out" }} onLoad={() => setArtistBgReady(true)} />
                                  )}
                                  {!altMode && <div className="absolute inset-0" style={{ opacity: artistVisible ? 1 : 0, background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 50%, rgba(0,0,0,0.5) 100%)", transition: "opacity 1.2s ease-in-out" }} />}
                                  {config.home.bgGradient && !artistVisible && !thumbVisible && <div className="absolute inset-0" style={{ background: buildHomeGradient(config.home) }} />}
                                  {!artistVisible && !thumbVisible && !config.home.bgGradient && config.home.bgImage && <img src={config.home.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
                                </>
                              );
                            })()}
                            

                             {/* ── TOP-LEFT: Big neon clock + date + SYNC ── */}
                             <div style={{ position: "absolute", top: `${pvh(4)}px`, left: `${pvh(5)}px`, zIndex: 20 }}>
                               <div className="font-black" style={{ fontSize: `${pvh(5.5)}px`, fontVariantNumeric: "tabular-nums", lineHeight: 0.9, color: "#fff", textShadow: "0 0 20px rgba(var(--layout-accent-rgb, 68,68,68),0.6), 0 0 40px rgba(var(--layout-accent-rgb, 68,68,68),0.3)", letterSpacing: "-0.02em" }}>
                                 {currentTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                               </div>
                               <div className="font-semibold" style={{ fontSize: `${pvh(1.3)}px`, color: "var(--layout-accent-color, #888)", marginTop: `${pvh(0.3)}px` }}>
                                 {currentTime.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })}
                               </div>
                               <div className="flex items-center" style={{ gap: `${pvh(0.4)}px`, marginTop: `${pvh(0.4)}px`, opacity: 0.7 }}>
                                 <div style={{ width: `${pvh(0.6)}px`, height: `${pvh(0.6)}px`, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
                                 <span className="font-semibold uppercase" style={{ letterSpacing: "0.1em", fontSize: `${pvh(0.9)}px` }}>SYNC</span>
                               </div>
                             </div>

                             {/* ── TOP-RIGHT: "A seguir" ── */}
                             {nextProgram && (
                               <div style={{ position: "absolute", top: `${pvh(4)}px`, right: `${pvh(5)}px`, zIndex: 20, textAlign: "right" }}>
                                 <div className="font-semibold" style={{ fontSize: `${pvh(1.1)}px`, color: "var(--layout-accent-color, #888)", marginBottom: `${pvh(0.5)}px` }}>a seguir</div>
                                 <div className="font-bold" style={{ fontSize: `${pvh(2.2)}px`, lineHeight: 1.2, textShadow: "0 1px 6px rgba(0,0,0,0.4)" }}>{nextProgram.nome}</div>
                                 <div className="font-medium" style={{ fontSize: `${pvh(0.9)}px`, color: "#fff", fontVariantNumeric: "tabular-nums", marginTop: `${pvh(0.2)}px` }}>{nextProgram.horario_inicio.slice(0,5)}h</div>
                               </div>
                             )}

                             {/* ── WRAPPER: BOX DO LOCUTOR + BOX CAPA ── */}
                             <div style={{
                               position: "absolute",
                               bottom: `${pvh(37.75)}px`,
                               left: "50%",
                               transform: "translateX(-50%)",
                               display: "flex",
                               alignItems: "stretch",
                               zIndex: 15,
                             }}>
                               {/* ── BOX DO LOCUTOR: quadrado 1:1 ── */}
                               <div style={{
                                 width: `${pvh(20)}px`,
                                 height: `${pvh(20)}px`,
                                 borderRadius: `${pvh(2)}px`,
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
                                 position: "relative",
                                 flexShrink: 0,
                               }}>
                                 <div className="flex items-start justify-between" style={{ gap: `${pvh(0.6)}px`, minWidth: 0 }}>
                                   <div style={{ minWidth: 0, flex: 1 }}>
                                     <div className="flex items-center justify-center" style={{ gap: `${pvh(0.35)}px`, minWidth: 0 }}>
                                       <Mic size={pvh(1)} style={{ opacity: 0.8, flexShrink: 0 }} />
                                       <span className="font-normal" style={{ fontSize: `${pvh(1.05)}px`, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentProgram?.apresentador || ""}</span>
                                     </div>
                                   </div>
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
                                   {musicData ? (
                                     <div key={musicKey} style={{ animation: "cenario-cover-in 0.6s cubic-bezier(0.16,1,0.3,1) both" }}>
                                       <div className="flex items-center" style={{ gap: `${pvh(0.35)}px`, marginBottom: `${pvh(0.25)}px` }}>
                                         <Music size={pvh(0.85)} style={{ opacity: 0.7, flexShrink: 0 }} />
                                         <span className="font-semibold uppercase" style={{ letterSpacing: "0.12em", fontSize: `${pvh(0.72)}px`, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Tocando Agora</span>
                                       </div>
                                       <div className="font-extrabold" style={{ fontSize: `${pvh(1.3)}px`, lineHeight: 1.15, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{musicData.titulo}</div>
                                       <div className="font-medium" style={{ fontSize: `${pvh(0.95)}px`, opacity: 0.7, marginTop: `${pvh(0.15)}px`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{musicData.artista}</div>
                                     </div>
                                   ) : currentProgram ? (
                                     <div className="font-extrabold" style={{ fontSize: `${pvh(1.3)}px`, lineHeight: 1.1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentProgram.nome}</div>
                                   ) : null}
                                 </div>
                               </div>

                               {/* ── BOX CAPA: slides out from behind locutor ── */}
                               {musicData?.capa && !isBreakTrack && (
                                 <div
                                   key={musicData.capa}
                                   style={{
                                     width: `${pvh(20)}px`,
                                     height: `${pvh(20)}px`,
                                     borderRadius: `${pvh(2)}px`,
                                     overflow: "hidden",
                                     flexShrink: 0,
                                     zIndex: 1,
                                     marginLeft: `-${pvh(1)}px`,
                                     animation: "cenario-capa-slide-in 0.7s cubic-bezier(0.16,1,0.3,1) both",
                                     padding: `${pvh(0.78)}px`,
                                     background: "rgba(255,255,255,0.12)",
                                     backdropFilter: "blur(20px)",
                                     WebkitBackdropFilter: "blur(20px)",
                                     border: "1px solid rgba(255,255,255,0.25)",
                                     boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.15)",
                                   }}
                                 >
                                   <img
                                     src={musicData.capa}
                                     alt=""
                                     style={{
                                       width: "100%",
                                       height: "100%",
                                       objectFit: "cover",
                                       borderRadius: `${pvh(1.4)}px`,
                                     }}
                                   />
                                 </div>
                               )}
                             </div>

                             {/* ── Sponsor logos (centered bottom, same as external screen) ── */}
                             {sponsorLogos.length > 0 && (
                               <div style={{ position: "absolute", bottom: `${pvh(9)}px`, left: "50%", transform: "translateX(-50%)", zIndex: 10 }}>
                                 <div style={{ position: "relative", display: "flex", justifyContent: "center", alignItems: "center", height: `${pvh(23.4)}px` }}>
                                   {sponsorLogos.map((l, i) => l.logo_url && (
                                     <img key={l.id} src={l.logo_url} alt={l.nome} className="object-contain" style={{ position: "absolute", maxWidth: `${pvh(39)}px`, maxHeight: `${pvh(21.5)}px`, opacity: i === sponsorIdx ? 1 : 0, transform: i === sponsorIdx ? "scale(1)" : "scale(0.9)", transition: "opacity 0.8s ease, transform 0.8s ease", filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.4))" }} />
                                   ))}
                                 </div>
                               </div>
                             )}

                             {/* Progress bar — premium animated */}
                             <div style={{ position: "absolute", bottom: `${pvh(2)}px`, left: `${pvh(2.6)}px`, right: `${pvh(2.6)}px`, height: `${pvh(0.5)}px`, background: "rgba(255,255,255,0.15)", zIndex: 15, overflow: "hidden", borderRadius: `${pvh(0.3)}px` }}>
                               <div style={{ width: `${progressPct}%`, height: "100%", borderRadius: `${pvh(0.3)}px`, background: "linear-gradient(90deg, var(--layout-accent-color, #444), rgba(255,255,255,0.5), var(--layout-accent-color, #444))", backgroundSize: "200% 100%", animation: "shimmerProgress 2s linear infinite", transition: "width 1s linear", boxShadow: "0 0 6px var(--layout-accent-color, #444), 0 0 14px rgba(255,255,255,0.15)" }} />
                             </div>
                             <style>{`@keyframes shimmerProgress { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }`}</style>
                          </div>
                        );
                      })()}

                      {/* ═══ WEATHER ═══ */}
                      {activeTab === "weather" && weatherSubTab !== "satellite" && (
                        <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ color: "#fff" }}>
                          {!config.weather.bgImage && <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, #0a1628 0%, #0d2847 30%, #134e7a 60%, #1a6fad 85%, #4a9fd4 100%)" }} />}
                          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 75% 15%, rgba(255,255,255,0.12) 0%, transparent 55%)" }} />
                          <div className="absolute bottom-0 left-0 right-0" style={{ height: "40%", background: "linear-gradient(to top, rgba(0,0,0,0.45), transparent)" }} />
                          <div className="relative z-10 flex flex-col h-full items-center justify-center" style={{ padding: `${pvh(4)}px`, paddingLeft: `calc(${pvh(4)}px + 50px)` }}>
                            {liveWeather ? (<>
                              {weatherSubTab === "today" && (
                                <div style={{ width: "88%", maxWidth: `${pvh(46)}px` }}>
                                  <div className="flex items-start justify-between" style={{ marginBottom: `${pvh(3)}px` }}>
                                    <div>
                                      <div className="font-black leading-none" style={{ fontSize: `${pvh(4.5)}px`, letterSpacing: "-0.03em", textShadow: "0 3px 20px rgba(0,0,0,0.6)" }}>{weatherCity || config.city || "Cidade"}</div>
                                      <div className="font-bold uppercase tracking-widest" style={{ fontSize: `${pvh(1.6)}px`, color: "var(--layout-accent-color, #444)", marginTop: `${pvh(0.6)}px`, letterSpacing: "0.2em" }}>agora</div>
                                    </div>
                                  </div>
                                  <div className="rounded-3xl" style={{ padding: `${pvh(3)}px`, background: "rgba(255,255,255,0.08)", backdropFilter: "blur(24px)", border: "1px solid rgba(255,255,255,0.15)", boxShadow: "0 12px 48px rgba(0,0,0,0.2)" }}>
                                    <div className="flex items-center" style={{ gap: `${pvh(3)}px`, marginBottom: `${pvh(2.5)}px` }}>
                                      <div style={{ width: `${pvh(14)}px`, height: `${pvh(14)}px`, filter: "drop-shadow(0 6px 16px rgba(0,0,0,0.3))" }}>
                                        <WeatherIcon code={liveWeather.current.code} size={pvh(14)} forceDay />
                                      </div>
                                      <div className="flex flex-col">
                                        <div className="font-black" style={{ fontSize: `${pvh(8)}px`, lineHeight: 0.9, textShadow: "0 3px 16px rgba(0,0,0,0.4)" }}>{liveWeather.current.temp}°</div>
                                        <div className="font-medium" style={{ fontSize: `${pvh(2)}px`, opacity: 0.85, marginTop: `${pvh(0.5)}px` }}>{getWLabel(liveWeather.current.code)}</div>
                                      </div>
                                    </div>
                                    <div className="flex items-center justify-between rounded-2xl" style={{ padding: `${pvh(1.8)}px ${pvh(2.5)}px`, background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.08)" }}>
                                      <div className="flex items-center" style={{ gap: `${pvh(1)}px` }}>
                                        <Thermometer size={pvh(2.2)} style={{ opacity: 0.7 }} />
                                        <span className="font-bold tabular-nums" style={{ fontSize: `${pvh(2.2)}px` }}>{liveWeather.daily[0]?.min ?? "--"}° / {liveWeather.daily[0]?.max ?? "--"}°</span>
                                      </div>
                                      <div className="flex items-center" style={{ gap: `${pvh(2)}px`, fontSize: `${pvh(1.8)}px` }}>
                                        <span className="flex items-center" style={{ gap: `${pvh(0.5)}px` }}><Droplets size={pvh(1.8)} style={{ opacity: 0.7 }} /> {liveWeather.current.humidity}%</span>
                                        <span className="flex items-center" style={{ gap: `${pvh(0.5)}px` }}>🌧 {liveWeather.daily[0]?.precip ?? 0}%</span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {weatherSubTab === "forecast" && (
                                <div className="flex flex-col items-center justify-center" style={{ width: "92%", maxWidth: `${pvh(55)}px`, height: "100%" }}>
                                  <div className="text-center" style={{ marginBottom: `${pvh(4)}px` }}>
                                    <div className="font-extrabold leading-none" style={{ fontSize: `${pvh(5)}px`, letterSpacing: "-0.03em", textShadow: "0 3px 20px rgba(0,0,0,0.5)" }}>{weatherCity || config.city || "Cidade"}</div>
                                    <div className="font-bold uppercase tracking-widest" style={{ fontSize: `${pvh(1.8)}px`, color: "var(--layout-accent-color, #444)", marginTop: `${pvh(0.8)}px`, letterSpacing: "0.2em" }}>próximos dias</div>
                                  </div>
                                  <div className="w-full flex flex-col" style={{ gap: `${pvh(1.5)}px` }}>
                                    {liveWeather.daily.slice(1, 5).map((d, i) => (
                                      <div key={i} className={`w-full flex items-center cenario-anim-row-${i + 1}`} style={{
                                        padding: `${pvh(2)}px ${pvh(2.5)}px`,
                                        background: "rgba(255,255,255,0.06)",
                                        borderRadius: `${pvh(2)}px`,
                                        backdropFilter: "blur(20px)",
                                        border: "1px solid rgba(255,255,255,0.1)",
                                        boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
                                        gap: `${pvh(2)}px`,
                                      }}>
                                        <div style={{ minWidth: `${pvh(11)}px` }}>
                                          <span className="font-black capitalize" style={{ fontSize: `${pvh(2)}px`, lineHeight: 1.1 }}>{new Date(d.date + "T12:00").toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" })}</span>
                                        </div>
                                        <div style={{ width: `${pvh(6)}px`, height: `${pvh(6)}px`, flexShrink: 0 }}>
                                          <WeatherIcon code={d.code} size={pvh(6)} forceDay />
                                        </div>
                                        <div className="flex flex-col flex-1" style={{ minWidth: 0, gap: `${pvh(0.4)}px` }}>
                                          <div className="flex items-center" style={{ gap: `${pvh(1)}px`, fontSize: `${pvh(1.3)}px`, opacity: 0.7, lineHeight: 1 }}>
                                            <span style={{ color: "#7dd3fc" }}>💧{d.precip}%</span>
                                            <span>{d.rainMm}mm</span>
                                          </div>
                                          <div style={{ fontSize: `${pvh(1.3)}px`, opacity: 0.6, lineHeight: 1 }}>🌬 {d.windMax}km/h</div>
                                        </div>
                                        <div className="flex items-baseline" style={{ flexShrink: 0, gap: `${pvh(0.6)}px` }}>
                                          <span className="font-black tabular-nums" style={{ fontSize: `${pvh(2.8)}px`, lineHeight: 1 }}>{d.max}°</span>
                                          <span className="font-medium tabular-nums" style={{ fontSize: `${pvh(1.7)}px`, opacity: 0.55, lineHeight: 1 }}>{d.min}°</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
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
                        <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ color: "#fff" }}>
                          {config.currency.bgImage && <div className="absolute inset-0" style={{ background: "rgba(3,8,14,0.5)" }} />}
                          {!config.currency.bgImage && <div className="absolute inset-0" style={{ background: "linear-gradient(160deg, #080c14 0%, #0f1923 30%, #141e2e 60%, #0d1520 100%)" }} />}
                          <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 30%, rgba(255,255,255,0.04) 0%, transparent 60%)" }} />
                          <div className="relative z-10 flex flex-col h-full items-center justify-center" style={{ padding: `${pvh(4)}px`, paddingLeft: `calc(${pvh(4)}px + 50px)` }}>
                            {config.currency.enabled ? (
                              <CenarioQuotesPanel
                                accentColor="var(--layout-accent-color, #444)"
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
                        <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ color: "#fff" }}>
                          {!config.chat.bgImage && <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #0a0a0a 0%, #1a1a1a 100%)" }} />}
                          <div className="absolute bottom-0 left-0 right-0 h-1/4" style={{ background: "linear-gradient(to top, rgba(200,230,0,0.25), transparent)" }} />
                          <div className="relative z-10 flex flex-col h-full" style={{ padding: `${pvh(3)}px` }}>
                            {config.chat.enabled ? (<>
                              <div className="flex justify-end mb-1"><MessageCircle size={pvh(3)} className="drop-shadow-lg" style={{ color: "var(--layout-accent-color, #444)" }} /></div>
                              <div style={{ marginBottom: `${pvh(2)}px` }}>
                                <div className="font-extrabold leading-tight drop-shadow-lg" style={{ fontSize: `${pvh(4)}px` }}>mensagens</div>
                                <div className="font-bold" style={{ fontSize: `${pvh(2.5)}px`, color: "var(--layout-accent-color, #444)" }}>chat</div>
                              </div>
                              <div className="flex-1 rounded-xl overflow-hidden" style={{ background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.15)", padding: `${pvh(2)}px` }}>
                                <div className="font-bold opacity-70" style={{ fontSize: `${pvh(1.6)}px`, marginBottom: `${pvh(1)}px` }}>mensagens aqui</div>
                                {mockMessages.map((m, i) => (
                                  <div key={i} className={`rounded-lg cenario-anim-row-${Math.min(i + 1, 8)}`} style={{ padding: `${pvh(1)}px ${pvh(1.5)}px`, marginBottom: `${pvh(0.8)}px`, background: "rgba(255,255,255,0.08)", fontSize: `${pvh(1.6)}px` }}>
                                    <span className="font-bold">{m.user}: </span>
                                    <span className="opacity-80">{m.text}</span>
                                  </div>
                                ))}
                              </div>
                            </>) : (
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
