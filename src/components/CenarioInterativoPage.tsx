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
  home: { bgImage: "", showArtistImage: true, showMusicCover: true, showProgramThumb: true },
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
        className="h-7 px-3 text-xs bg-[var(--layout-accent-color)] hover:bg-[var(--layout-accent-color)]/90 text-white"
        style={{ backgroundColor: 'var(--layout-accent-color)' }}
      >
        Salvar
      </Button>
    </div>
  );
}

export default function CenarioInterativoPage() {
  const { user } = useAuth();
  const [config, setConfig] = useState<CenarioConfig>(defaultConfig);
  const [activeTab, setActiveTab] = useState("home");
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [weatherSubTab, setWeatherSubTab] = useState("today");
  const [currencySubTab, setCurrencySubTab] = useState<"moedas" | "bolsas">("moedas");
  const [satelliteZoom, setSatelliteZoom] = useState(6);

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
  const [previewZoom, setPreviewZoom] = useState(0.6);
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
      case "square": ctx.rect(sx, sy, w, h); break;
      case "circle": { const rx = Math.abs(w) / 2, ry = Math.abs(h) / 2; const cx = sx + w / 2, cy = sy + h / 2; ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); break; }
      case "triangle": ctx.moveTo(sx + w / 2, sy); ctx.lineTo(sx + w, sy + h); ctx.lineTo(sx, sy + h); ctx.closePath(); break;
      case "diamond": ctx.moveTo(sx + w / 2, sy); ctx.lineTo(sx + w, sy + h / 2); ctx.lineTo(sx + w / 2, sy + h); ctx.lineTo(sx, sy + h / 2); ctx.closePath(); break;
      case "star": { const cx = sx + w / 2, cy = sy + h / 2; const outerR = Math.min(Math.abs(w), Math.abs(h)) / 2; const innerR = outerR * 0.4; for (let i = 0; i < 10; i++) { const r = i % 2 === 0 ? outerR : innerR; const angle = (Math.PI / 5) * i - Math.PI / 2; const px = cx + r * Math.cos(angle); const py = cy + r * Math.sin(angle); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); } ctx.closePath(); break; }
      case "arrow-up": { const cx = sx + w / 2; ctx.moveTo(cx, sy); ctx.lineTo(sx + w, sy + h * 0.4); ctx.moveTo(cx, sy); ctx.lineTo(sx, sy + h * 0.4); ctx.moveTo(cx, sy); ctx.lineTo(cx, sy + h); break; }
      case "arrow-right": { const cy = sy + h / 2; ctx.moveTo(sx + w, cy); ctx.lineTo(sx + w * 0.6, sy); ctx.moveTo(sx + w, cy); ctx.lineTo(sx + w * 0.6, sy + h); ctx.moveTo(sx + w, cy); ctx.lineTo(sx, cy); break; }
      case "arrow-down": { const cx = sx + w / 2; ctx.moveTo(cx, sy + h); ctx.lineTo(sx + w, sy + h * 0.6); ctx.moveTo(cx, sy + h); ctx.lineTo(sx, sy + h * 0.6); ctx.moveTo(cx, sy + h); ctx.lineTo(cx, sy); break; }
      case "arrow-left": { const cy = sy + h / 2; ctx.moveTo(sx, cy); ctx.lineTo(sx + w * 0.4, sy); ctx.moveTo(sx, cy); ctx.lineTo(sx + w * 0.4, sy + h); ctx.moveTo(sx, cy); ctx.lineTo(sx + w, cy); break; }
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
    cenarioBcRef.current?.postMessage({ type: "draw", action, px, py, color, width });
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
    if (previewDrawMode === "shape" && selectedShape && shapeStartPos) return;
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

  useEffect(() => {
    const el = previewWrapRef.current;
    if (!el) return;
    const measure = () => {
      const scale = el.clientWidth / PREV_W;
      setPreviewScale(scale || 1);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

    const pingInterval = setInterval(() => {
      bc.postMessage({ type: "ping" });
      setTimeout(() => {
        if (Date.now() - lastPongRef.current > 5000 && !presenceConnectedRef.current) setExternalConnected(false);
      }, 2000);
    }, 3000);
    bc.postMessage({ type: "ping" });

    return () => { cenarioBcRef.current = null; clearInterval(pingInterval); bc.close(); };
  }, [drawOnCanvas]);

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
  const [currentProgram, setCurrentProgram] = useState<{ nome: string; id: string; selo?: string | null; horario_inicio: string; horario_fim: string; apresentador?: string; apresentadorInstagram?: string; apresentadoresInstagrams?: string[]; apresentadorFoto?: string; apresentadoresFotos?: string[]; tipo_programa?: string | null; thumb?: string | null; capa?: string | null } | null>(null);
  const [presenterIdx, setPresenterIdx] = useState(0);
  const [musicData, setMusicData] = useState<{ titulo: string; artista: string; capa: string } | null>(null);
  const [musicKey, setMusicKey] = useState(0);
  const prevMusicRef = useRef("");
  const [artistBgUrl, setArtistBgUrl] = useState<string | null>(null);
  const artistBgCacheRef = useRef<Record<string, string>>({});
  const [artistBgReady, setArtistBgReady] = useState(false);
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

  const exceptionWordsList = (config.home.exceptionWords || "break,vinhetas,hora certa").split(",").map(w => w.trim().toLowerCase()).filter(Boolean);
  const isBreakTrack = (() => {
    const titulo = (musicData?.titulo || "").toLowerCase();
    const artista = (musicData?.artista || "").toLowerCase();
    return exceptionWordsList.some(w => titulo === w || artista === w || titulo.includes(w) || artista.includes(w));
  })();
  useEffect(() => {
    if (isBreakTrack) { setArtistBgUrl(null); setArtistBgReady(false); return; }
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

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (sponsorLogos.length <= 1) { setSponsorIdx(0); return; }
    const t = setInterval(() => setSponsorIdx(prev => (prev + 1) % sponsorLogos.length), 5000);
    return () => clearInterval(t);
  }, [sponsorLogos.length]);

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
    const interval = setInterval(load, 120000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [config.currency.enabled]);

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
        let apresentadorInstagram = "";
        let apresentadoresInstagrams: string[] = [];
        const apIds = onAir.apresentadores_ids?.length ? onAir.apresentadores_ids : onAir.apresentador_id ? [onAir.apresentador_id] : [];
        if (apIds.length) {
          const { data: aps } = await supabase.from("apresentadores").select("nome, foto, instagram").in("id", apIds);
          apresentadorNome = aps?.map(a => a.nome).join(", ") || "";
          apresentadoresFotos = (aps || []).map(a => a.foto).filter((f): f is string => !!f);
          apresentadorFoto = apresentadoresFotos[0] || "";
          apresentadoresInstagrams = (aps || []).map(a => a.instagram).filter((i): i is string => !!i);
          apresentadorInstagram = apresentadoresInstagrams[0] || "";
        }
        setCurrentProgram({ 
          nome: onAir.nome, id: onAir.id, selo: onAir.selo, thumb: (onAir as any).thumb || null, capa: (onAir as any).capa || null, 
          horario_inicio: onAir.horario_inicio, horario_fim: onAir.horario_fim, 
          apresentador: apresentadorNome, apresentadorInstagram, apresentadoresInstagrams,
          apresentadorFoto, apresentadoresFotos, 
          tipo_programa: onAir.tipo_programa 
        });
        const { data: logos } = await supabase
          .from("logos_patrocinadores")
          .select("id, nome, logo_url")
          .eq("programa_id", onAir.id)
          .eq("user_id", user.id)
          .eq("ativo", true)
          .eq("excluido", false);
        setSponsorLogos(logos || []);
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

  useEffect(() => {
    const fotos = currentProgram?.apresentadoresFotos || [];
    setPresenterIdx(0);
    if (fotos.length <= 1) return;
    const id = setInterval(() => {
      setPresenterIdx(i => (i + 1) % fotos.length);
    }, 10000);
    return () => clearInterval(id);
  }, [currentProgram?.id, currentProgram?.apresentadoresFotos?.join("|")]);

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
      } catch { }
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
        } catch { }
      } else {
        applyCachedConfig();
      }
      setLoaded(true);
    })();
  }, [user?.id]);

  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem("cenario_interativo_config_cache_v1", JSON.stringify(config));
    } catch { }
    cenarioBcRef.current?.postMessage({ type: "config-update", config });
    rtDrawChannelRef.current?.send({ type: "broadcast", event: "config-update", payload: { config } });
  }, [config, loaded]);

  const weatherCity = config.weather.city || config.city;
  const weatherFetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!config.weather.enabled || !weatherCity) return;
    if (weatherFetchRef.current) clearTimeout(weatherFetchRef.current);
    weatherFetchRef.current = setTimeout(async () => {
      setWeatherLoading(true);
      try {
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
        const { data: forecastData } = await supabase.functions.invoke("fetch-weather", {
          body: { action: "forecast", lat: latitude, lon: longitude, forecast_days: 5 },
        });
        if (forecastData?.ok && forecastData.data) {
          const d = forecastData.data;
          setLiveWeather({
            current: { temp: Math.round(d.current?.temperature_2m ?? 0), humidity: Math.round(d.current?.relative_humidity_2m ?? 0), code: d.current?.weather_code ?? 0 },
            daily: (d.daily?.time || []).map((date: string, i: number) => ({
              date, min: Math.round(d.daily.temperature_2m_min?.[i] ?? 0), max: Math.round(d.daily.temperature_2m_max?.[i] ?? 0), code: d.daily.weather_code?.[i] ?? 0, humidity: Math.round(d.daily.relative_humidity_2m_max?.[i] ?? 0), precip: Math.round(d.daily.precipitation_probability_max?.[i] ?? 0), rainMm: Math.round((d.daily.precipitation_sum?.[i] ?? 0) * 10) / 10, windMax: Math.round(d.daily.wind_speed_10m_max?.[i] ?? 0)
            })),
          });
        }
      } catch (err) { console.error("Weather fetch error:", err); }
      setWeatherLoading(false);
    }, 1000);
    return () => { if (weatherFetchRef.current) clearTimeout(weatherFetchRef.current); };
  }, [config.weather.enabled, weatherCity]);

  const trafficCity = config.traffic.city || config.city;
  const trafficGeoRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => { if (trafficCity) setTrafficSearchCity(trafficCity); }, [trafficCity]);
  useEffect(() => {
    if (!config.traffic.enabled || !trafficCity) { setTrafficCoords(null); return; }
    if (config.traffic.lat != null && config.traffic.lon != null) {
      setTrafficCoords({ lat: config.traffic.lat, lon: config.traffic.lon });
      return;
    }
    if (trafficGeoRef.current) clearTimeout(trafficGeoRef.current);
    trafficGeoRef.current = setTimeout(async () => {
      try {
        const { data: geoData } = await supabase.functions.invoke("fetch-weather", { body: { action: "geocode", query: trafficCity, count: 1 } });
        const results = geoData?.results;
        if (results?.length) {
          const lat = results[0].latitude;
          const lon = results[0].longitude;
          setTrafficCoords({ lat, lon });
          updateTraffic({ lat, lon });
        }
      } catch { }
    }, 1000);
    return () => { if (trafficGeoRef.current) clearTimeout(trafficGeoRef.current); };
  }, [config.traffic.enabled, trafficCity, config.traffic.lat, config.traffic.lon]);

  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevSaveRef = useRef<string>("");
  const pendingSaveRef = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    if (!user?.id || !loaded) return;
    if (saveTimeout.current) clearTimeout(saveTimeout.current);
    const configWithTabs = { ...config, _activeTab: activeTab, _weatherSubTab: weatherSubTab, _currencySubTab: currencySubTab, _screenRotation: externalRotation };
    const serialized = JSON.stringify(configWithTabs);
    if (serialized === prevSaveRef.current) { pendingSaveRef.current = null; return; }
    const doSave = async () => {
      prevSaveRef.current = serialized;
      pendingSaveRef.current = null;
      setSaving(true);
      const { error } = await supabase.from("user_settings").upsert({ user_id: user.id, cenario_config: configWithTabs } as any, { onConflict: "user_id" });
      if (!error) {
        setSavedFlash(true);
        if (savedFlashTimer.current) clearTimeout(savedFlashTimer.current);
        savedFlashTimer.current = setTimeout(() => setSavedFlash(false), 2500);
      }
      setSaving(false);
    };
    pendingSaveRef.current = doSave;
    saveTimeout.current = setTimeout(doSave, 800);
    return () => { if (saveTimeout.current) clearTimeout(saveTimeout.current); if (pendingSaveRef.current) pendingSaveRef.current(); };
  }, [config, user?.id, loaded, activeTab, weatherSubTab, currencySubTab, externalRotation]);

  const updateHome = (partial: Partial<HomeConfig>) => setConfig(c => ({ ...c, home: { ...c.home, ...partial } }));
  const updateWeather = (partial: Partial<WeatherConfig>) => setConfig(c => ({ ...c, weather: { ...c.weather, ...partial } }));
  const updateTraffic = (partial: Partial<TrafficConfig>) => setConfig(c => ({ ...c, traffic: { ...c.traffic, ...partial } }));
  const updateCurrency = (partial: Partial<CurrencyConfig>) => setConfig(c => ({ ...c, currency: { ...c.currency, ...partial } }));
  const updateChat = (partial: Partial<ChatConfig>) => setConfig(c => ({ ...c, chat: { ...c.chat, ...partial } }));

  const removeTrafficPoint = (id: string) => updateTraffic({ points: config.traffic.points.filter(p => p.id !== id) });
  const toggleFavoritePoint = (p: TrafficPoint) => {
    const favorites = config.traffic.favorites || [];
    const isFavorite = favorites.some(f => f.id === p.id);
    updateTraffic({ favorites: isFavorite ? favorites.filter(f => f.id !== p.id) : [...favorites, p] });
    toast.success(isFavorite ? "Removido dos favoritos" : "Adicionado aos favoritos");
  };
  const loadFavoritePoint = (p: TrafficPoint) => {
    if (!config.traffic.points.some(pt => pt.id === p.id)) {
      updateTraffic({ points: [...config.traffic.points, p], lat: p.lat, lon: p.lng, zoom: 15 });
    } else {
      goToTrafficPoint(p);
    }
  };
  const updateTrafficPointPosition = async (id: string, lat: number, lng: number) => {
    try {
      const { data } = await supabase.functions.invoke("fetch-weather", { body: { action: "geocode", query: `${lat}, ${lng}`, count: 1 } });
      const newLabel = data?.results?.[0]?.display_name?.split(',')[0] || `Ponto ${config.traffic.points.findIndex(p => p.id === id) + 1}`;
      updateTraffic({ points: config.traffic.points.map(p => p.id === id ? { ...p, lat, lng, label: newLabel } : p) });
      toast.success("Posição do ponto atualizada");
    } catch {
      updateTraffic({ points: config.traffic.points.map(p => p.id === id ? { ...p, lat, lng } : p) });
    }
  };
  const goToTrafficPoint = (p: TrafficPoint) => {
    setTrafficCoords({ lat: p.lat, lon: p.lng });
    updateTraffic({ lat: p.lat, lon: p.lng, zoom: 15 });
    setActiveTrafficPointId(p.id);
    toast.info(`Navegando para: ${p.label}`);
    setTimeout(() => setActiveTrafficPointId(null), 4000);
  };
  const toggleCurrency = (code: string) => {
    const has = config.currency.currencies.includes(code);
    updateCurrency({ currencies: has ? config.currency.currencies.filter(c => c !== code) : [...config.currency.currencies, code] });
  };
  const handleTrafficCityInput = async (query: string) => {
    setTrafficSearchCity(query);
    if (query.length < 2) { setTrafficCitySuggestions([]); return; }
    setIsSearchingCity(true);
    try {
      const { data } = await supabase.functions.invoke("fetch-weather", { body: { action: "geocode", query, count: 5 } });
      if (data?.results) setTrafficCitySuggestions(data.results);
    } catch { }
    setIsSearchingCity(false);
  };
  const selectTrafficCity = (city: any) => {
    setTrafficSearchCity(city.name);
    setTrafficCitySuggestions([]);
    setTrafficCoords({ lat: city.latitude, lon: city.longitude });
    updateTraffic({ city: city.name, lat: city.latitude, lon: city.longitude, zoom: 12 });
    if (!config.city) setConfig(c => ({ ...c, city: city.name }));
  };
  const handleTrafficSearch = async () => {
    if (!trafficSearchCity.trim()) return;
    setWeatherLoading(true);
    try {
      const { data: geoData } = await supabase.functions.invoke("fetch-weather", { body: { action: "geocode", query: trafficSearchCity.trim(), count: 1 } });
      if (geoData?.results?.length) {
        const { latitude, longitude } = geoData.results[0];
        setTrafficCoords({ lat: latitude, lon: longitude });
        updateTraffic({ city: trafficSearchCity.trim(), lat: latitude, lon: longitude, zoom: 12 });
        if (!config.city) setConfig(c => ({ ...c, city: trafficSearchCity.trim() }));
      } else toast.error("Cidade não encontrada");
    } catch { }
    setWeatherLoading(false);
  };
  const searchAddress = async (query: string) => {
    setTrafficSearchAddress(query);
    if (query.length < 2) { setAddressSuggestions([]); return; }
    setIsSearchingAddress(true);
    try {
      const cityFilter = trafficSearchCity || config.traffic.city || config.city;
      const fullQuery = cityFilter ? `${query}, ${cityFilter}` : query;
      const { data } = await supabase.functions.invoke("fetch-weather", { body: { action: "geocode", query: fullQuery, count: 5 } });
      if (data?.results) setAddressSuggestions(data.results);
    } catch { }
    setIsSearchingAddress(false);
  };
  const selectAddress = (addr: any) => {
    setTrafficCoords({ lat: addr.latitude, lon: addr.longitude });
    updateTraffic({ lat: addr.latitude, lon: addr.longitude, zoom: 15 });
    setTrafficSearchAddress(addr.name || "");
    setAddressSuggestions([]);
    updateTraffic({ points: [...config.traffic.points, { id: Math.random().toString(36).substring(2, 9), label: addr.name || "", lat: addr.latitude, lng: addr.longitude }] });
    toast.success("Endereço marcado no mapa");
  };
  const addTrafficPoint = () => {
    const lat = config.traffic.lat ?? trafficCoords?.lat;
    const lon = config.traffic.lon ?? trafficCoords?.lon;
    if (lat === undefined || lon === undefined || lat === null || lon === null) { toast.error("Busque um endereço primeiro"); return; }
    updateTraffic({ points: [...config.traffic.points, { id: Math.random().toString(36).substring(2, 9), label: trafficSearchAddress || `Ponto ${config.traffic.points.length + 1}`, lat, lng: lon }] });
    toast.success("Ponto marcado no mapa");
  };

  const headerStyle = { background: "linear-gradient(135deg, var(--layout-header-bg, #0d0446), color-mix(in srgb, var(--layout-header-bg, #1a1a1a) 80%, white 20%))", color: "var(--layout-header-text, #ffffff)" };
  const pageStyle = { background: "var(--layout-page-bg, #ffffff)", boxShadow: "0 4px 24px rgba(0,0,0,0.08)", border: "1px solid color-mix(in srgb, var(--layout-border-color, #333333) 20%, transparent)" };
  const textColor = "var(--layout-page-text, #1a1a1a)";
  const mutedText = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 60%, transparent)";
  const subTabBg = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 6%, transparent)";
  const subTabActive = "var(--layout-header-bg, #0d0446)";
  const accentColor = "var(--layout-accent-color, #3b82f6)";

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
              <TabsContent value="home" className="space-y-5 animate-in fade-in-50 duration-500">
                <div className="space-y-6">
                  {/* Programa no Ar Card */}
                  <div className="relative overflow-hidden rounded-xl border p-4 transition-all" style={{ background: "color-mix(in srgb, var(--layout-header-bg, #0d0446) 3%, var(--layout-page-bg, #ffffff))", borderColor: "color-mix(in srgb, var(--layout-border-color, #333) 15%, transparent)" }}>
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-primary/10 text-primary"><Clock size={16} /></div>
                        <div>
                          <h4 className="text-sm font-bold leading-none">Programa no ar</h4>
                          <p className="text-[10px] opacity-60 mt-1 uppercase tracking-wider font-semibold">Monitoramento em tempo real</p>
                        </div>
                      </div>
                      {currentProgram && (
                        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/10 text-green-600 text-[10px] font-bold border border-green-500/20">
                          <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span></span>
                          AO VIVO
                        </div>
                      )}
                    </div>
                    {currentProgram ? (
                      <div className="space-y-4">
                        <div className="flex items-center gap-3">
                          <div className="h-12 w-12 rounded-lg overflow-hidden border border-white/20 bg-muted shrink-0">
                            <img src={currentProgram.thumb || currentProgram.capa || "https://images.unsplash.com/photo-1478737270239-2fccd27ee086?w=100&h=100&fit=crop"} className="h-full w-full object-cover" alt={currentProgram.nome} />
                          </div>
                          <div>
                            <div className="text-sm font-extrabold line-clamp-1">{currentProgram.nome}</div>
                            <div className="text-xs opacity-70 flex items-center gap-1 mt-0.5"><CalendarDays size={10} /> {currentProgram.horario_inicio} às {currentProgram.horario_fim}</div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="py-4 flex flex-col items-center justify-center text-center rounded-lg border-2 border-dashed border-black/5 bg-black/5">
                        <MonitorPlay size={24} className="opacity-20 mb-2" />
                        <span className="text-xs font-semibold opacity-40">Nenhum programa detectado no Estúdio FM</span>
                      </div>
                    )}
                  </div>

                  {/* Capas e Visibilidade */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Image size={14} className="text-primary" />
                      <h4 className="text-xs font-bold uppercase tracking-wider opacity-60">Capas e Visibilidade</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-card/50">
                        <div className="space-y-0.5">
                          <Label className="text-xs font-bold">Capa do Programa</Label>
                          <p className="text-[10px] text-muted-foreground">Alternar com a arte da música</p>
                        </div>
                        <Switch checked={config.home.showProgramThumb} onCheckedChange={(v) => updateHome({ showProgramThumb: v })} />
                      </div>
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-card/50">
                        <div className="space-y-0.5">
                          <Label className="text-xs font-bold">Capa da Música</Label>
                          <p className="text-[10px] text-muted-foreground">Mostrar arte do álbum (iTunes/Spotify)</p>
                        </div>
                        <Switch checked={config.home.showMusicCover} onCheckedChange={(v) => updateHome({ showMusicCover: v })} />
                      </div>
                    </div>
                  </div>

                  {/* Fundo e Estética */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Palette size={14} className="text-primary" />
                      <h4 className="text-xs font-bold uppercase tracking-wider opacity-60">Fundo e Estética</h4>
                    </div>
                    
                    <div className="space-y-4 p-4 rounded-xl border bg-card/30">
                      {/* Modo Alternado */}
                      <div className="flex items-center justify-between p-3 rounded-lg border bg-blue-500/5 border-blue-500/10">
                        <div className="space-y-0.5">
                          <Label className="text-xs font-bold">Modo de Fundo Alternado</Label>
                          <p className="text-[10px] text-muted-foreground">Alterna entre capa do programa e imagem do artista a cada 10s</p>
                        </div>
                        <Switch 
                          checked={config.bgAlternateMode} 
                          onCheckedChange={(v) => setConfig(c => ({ ...c, bgAlternateMode: v }))} 
                        />
                      </div>

                      <div className="space-y-3">
                        <Label className="text-xs font-bold">Imagem de Fundo Padrão (URL)</Label>
                        <div className="flex gap-2">
                          <Input 
                            className="text-xs h-9" 
                            value={config.home.bgImage} 
                            onChange={(e) => updateHome({ bgImage: e.target.value })} 
                            placeholder="https://images.unsplash.com/..."
                          />
                          <Button size="icon" variant="outline" className="h-9 w-9 shrink-0" onClick={() => updateHome({ bgImage: "" })}>
                            <Trash2 size={14} />
                          </Button>
                        </div>
                        <BgImageUpload 
                          value={config.home.bgImage} 
                          onChange={(v) => updateHome({ bgImage: v })} 
                          mutedText={mutedText} 
                          userId={user?.id} 
                          category="home-bg" 
                        />
                      </div>

                      {/* Configurações de Overlay do Programa */}
                      <div className="pt-2 border-t space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-bold">Sobreposição na Capa do Programa</Label>
                          <Switch 
                            checked={config.thumbOverlayEnabled} 
                            onCheckedChange={(v) => setConfig(c => ({ ...c, thumbOverlayEnabled: v }))} 
                          />
                        </div>
                        {config.thumbOverlayEnabled && (
                          <div className="space-y-3 animate-in fade-in slide-in-from-top-1">
                            <div className="flex gap-3">
                              <div className="flex-1 space-y-1">
                                <Label className="text-[10px] opacity-70">Cor do Overlay</Label>
                                <Input 
                                  type="color" 
                                  className="h-8 p-1 w-full" 
                                  value={config.thumbOverlayColor || "#000000"} 
                                  onChange={(e) => setConfig(c => ({ ...c, thumbOverlayColor: e.target.value }))} 
                                />
                              </div>
                              <div className="flex-[2] space-y-1">
                                <Label className="text-[10px] opacity-70">Opacidade ({config.thumbOverlayOpacity ?? 60}%)</Label>
                                <Slider 
                                  value={[config.thumbOverlayOpacity ?? 60]} 
                                  min={0} max={100} step={1}
                                  onValueChange={([v]) => setConfig(c => ({ ...c, thumbOverlayOpacity: v }))} 
                                />
                              </div>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-[10px] opacity-70">Posição da Capa</Label>
                              <Select 
                                value={config.programThumbPosition || "center"} 
                                onValueChange={(v) => setConfig(c => ({ ...c, programThumbPosition: v }))}
                              >
                                <SelectTrigger className="h-7 text-[10px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="center">Centralizado</SelectItem>
                                  <SelectItem value="top">Topo</SelectItem>
                                  <SelectItem value="bottom">Base</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Configurações de Overlay do Artista */}
                      <div className="pt-2 border-t space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-bold">Sobreposição na Imagem do Artista</Label>
                          <Switch 
                            checked={config.home.artistOverlayEnabled} 
                            onCheckedChange={(v) => updateHome({ artistOverlayEnabled: v })} 
                          />
                        </div>
                        {config.home.artistOverlayEnabled && (
                          <div className="flex gap-3 animate-in fade-in slide-in-from-top-1">
                            <div className="flex-1 space-y-1">
                              <Label className="text-[10px] opacity-70">Cor</Label>
                              <Input 
                                type="color" 
                                className="h-8 p-1 w-full" 
                                value={config.home.artistOverlayColor || "#000000"} 
                                onChange={(e) => updateHome({ artistOverlayColor: e.target.value })} 
                              />
                            </div>
                            <div className="flex-[2] space-y-1">
                              <Label className="text-[10px] opacity-70">Opacidade ({config.home.artistOverlayOpacity ?? 60}%)</Label>
                              <Slider 
                                value={[config.home.artistOverlayOpacity ?? 60]} 
                                min={0} max={100} step={1}
                                onValueChange={([v]) => updateHome({ artistOverlayOpacity: v })} 
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="pt-2 border-t space-y-3">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-bold">Usar Gradiente no Fundo</Label>
                          <Switch checked={config.home.bgGradient} onCheckedChange={(v) => updateHome({ bgGradient: v })} />
                        </div>
                        
                        {config.home.bgGradient && (
                          <div className="space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1.5">
                                <Label className="text-[10px] font-semibold opacity-70">Cor Inicial</Label>
                                <div className="flex gap-2 items-center">
                                  <div className="w-6 h-6 rounded border shrink-0" style={{ background: config.home.bgGradientColorA || "#1a1a2e" }} />
                                  <Input className="text-[10px] h-7" value={config.home.bgGradientColorA || "#1a1a2e"} onChange={(e) => updateHome({ bgGradientColorA: e.target.value })} />
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                <Label className="text-[10px] font-semibold opacity-70">Cor Final</Label>
                                <div className="flex gap-2 items-center">
                                  <div className="w-6 h-6 rounded border shrink-0" style={{ background: config.home.bgGradientColorB || "#16213e" }} />
                                  <Input className="text-[10px] h-7" value={config.home.bgGradientColorB || "#16213e"} onChange={(e) => updateHome({ bgGradientColorB: e.target.value })} />
                                </div>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <Label className="text-[10px] font-semibold opacity-70">Tipo de Gradiente</Label>
                              <Select value={config.home.bgGradientType || "linear"} onValueChange={(v: "linear" | "radial") => updateHome({ bgGradientType: v })}>
                                <SelectTrigger className="h-7 text-[10px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="linear">Linear</SelectItem>
                                  <SelectItem value="radial">Radial</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {config.home.bgGradientType !== "radial" && (
                              <div className="space-y-1.5">
                                <div className="flex justify-between items-center">
                                  <Label className="text-[10px] font-semibold opacity-70">Ângulo ({config.home.bgGradientAngle ?? 135}°)</Label>
                                </div>
                                <Slider 
                                  value={[config.home.bgGradientAngle ?? 135]} 
                                  min={0} max={360} step={1}
                                  onValueChange={([v]) => updateHome({ bgGradientAngle: v })} 
                                />
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Filtros e Exceções */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Eraser size={14} className="text-primary" />
                      <h4 className="text-xs font-bold uppercase tracking-wider opacity-60">Filtros e Exceções</h4>
                    </div>
                    <div className="p-4 rounded-xl border bg-card/30 space-y-3">
                      <div className="space-y-2">
                        <Label className="text-xs font-bold">Palavras de Exceção</Label>
                        <Input 
                          className="text-xs" 
                          placeholder="vinheta, comercial, trilha..." 
                          value={config.home.exceptionWords} 
                          onChange={(e) => updateHome({ exceptionWords: e.target.value })}
                        />
                        <p className="text-[10px] text-muted-foreground">Músicas que contenham estas palavras no título não mostrarão a capa.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="weather" className="space-y-5 animate-in fade-in-50 duration-500">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl border bg-card/30">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500"><CloudSun size={18} /></div>
                      <div>
                        <h4 className="text-sm font-bold">Módulo de Previsão do Tempo</h4>
                        <p className="text-[10px] opacity-60">Exibir clima e temperatura no cenário</p>
                      </div>
                    </div>
                    <Switch checked={config.weather.enabled} onCheckedChange={(v) => updateWeather({ enabled: v })} />
                  </div>

                  {config.weather.enabled && (
                    <div className="space-y-4 p-4 rounded-xl border bg-card/30 animate-in fade-in duration-300">
                      <div className="space-y-2">
                        <Label className="text-xs font-bold">Cidade para Previsão</Label>
                        <Input 
                          className="text-xs" 
                          placeholder="Ex: São Paulo, BR" 
                          value={config.weather.city} 
                          onChange={(e) => updateWeather({ city: e.target.value })}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex items-center justify-between p-2 rounded-lg border bg-card/50">
                          <Label className="text-[10px] font-bold">Tempo Atual</Label>
                          <Switch checked={config.weather.showCurrent} onCheckedChange={(v) => updateWeather({ showCurrent: v })} />
                        </div>
                        <div className="flex items-center justify-between p-2 rounded-lg border bg-card/50">
                          <Label className="text-[10px] font-bold">Previsão 3 Dias</Label>
                          <Switch checked={config.weather.showForecast3Days} onCheckedChange={(v) => updateWeather({ showForecast3Days: v })} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="traffic" className="space-y-5 animate-in fade-in-50 duration-500">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl border bg-card/30">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500"><Car size={18} /></div>
                      <div>
                        <h4 className="text-sm font-bold">Módulo de Trânsito</h4>
                        <p className="text-[10px] opacity-60">Exibir mapas e condições de tráfego</p>
                      </div>
                    </div>
                    <Switch checked={config.traffic.enabled} onCheckedChange={(v) => updateTraffic({ enabled: v })} />
                  </div>

                  {config.traffic.enabled && (
                    <div className="space-y-4 p-4 rounded-xl border bg-card/30 animate-in fade-in duration-300">
                      <div className="space-y-2">
                        <Label className="text-xs font-bold">Cidade Padrão</Label>
                        <Input 
                          className="text-xs" 
                          placeholder="Ex: Curitiba" 
                          value={config.traffic.city} 
                          onChange={(e) => updateTraffic({ city: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label className="text-xs font-bold">Zoom do Mapa</Label>
                        <Slider 
                          value={[config.traffic.zoom]} 
                          min={10} max={18} step={1}
                          onValueChange={([v]) => updateTraffic({ zoom: v })} 
                        />
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="currency" className="space-y-5 animate-in fade-in-50 duration-500">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl border bg-card/30">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-green-500/10 text-green-500"><DollarSign size={18} /></div>
                      <div>
                        <h4 className="text-sm font-bold">Módulo de Cotação</h4>
                        <p className="text-[10px] opacity-60">Exibir valores de moedas e cripto</p>
                      </div>
                    </div>
                    <Switch checked={config.currency.enabled} onCheckedChange={(v) => updateCurrency({ enabled: v })} />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="chat" className="space-y-5 animate-in fade-in-50 duration-500">
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-xl border bg-card/30">
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500"><MessageCircle size={18} /></div>
                      <div>
                        <h4 className="text-sm font-bold">Módulo de Chat (YouTube)</h4>
                        <p className="text-[10px] opacity-60">Exibir chat ao vivo no cenário</p>
                      </div>
                    </div>
                    <Switch checked={config.chat.enabled} onCheckedChange={(v) => updateChat({ enabled: v })} />
                  </div>
                  
                  {config.chat.enabled && (
                    <div className="space-y-4 p-4 rounded-xl border bg-card/30 animate-in fade-in duration-300">
                      <div className="space-y-2">
                        <Label className="text-xs font-bold">URL do Vídeo YouTube</Label>
                        <Input 
                          className="text-xs" 
                          placeholder="https://www.youtube.com/watch?v=..." 
                          value={config.chat.youtubeVideoUrl} 
                          onChange={(e) => updateChat({ youtubeVideoUrl: e.target.value })}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>
            </Tabs>
          </div>
          <div className="lg:flex-1 flex flex-col min-w-0" style={{ minHeight: 0 }}>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <div className="flex items-center gap-2"><Eye size={16} style={{ color: mutedText }} /><span className="text-sm font-semibold whitespace-nowrap">Preview cenário interativo</span></div>
            </div>
            <div className="flex flex-col items-center gap-3 w-full h-[700px] pt-4 min-h-0 overflow-hidden bg-black/5 dark:bg-black/20 rounded-2xl relative">
              <div className="flex-1 w-full flex items-start justify-center overflow-hidden">
                <div ref={previewWrapRef} className="relative rounded-2xl overflow-hidden shadow-2xl transition-all duration-300 ease-out" style={{ height: "100%", width: "auto", aspectRatio: "9 / 16", background: "#000", transform: `scale(${previewZoom})`, transformOrigin: "top center" }}>
                  <div style={{ width: PREV_W, height: PREV_H, transform: `scale(${previewScale})`, transformOrigin: "top left", position: "absolute", top: 0, left: 0 }}>
                    {/* Render matching CenarioTela visual layers */}
                    <div className="absolute inset-0" style={{ background: "#000", zIndex: 0 }}>
                      {/* Gradient Layer */}
                      <div className="absolute inset-0" style={{ 
                        background: config.home.bgGradient ? buildHomeGradient(config.home) : "transparent",
                        zIndex: 1 
                      }} />
                      
                      {/* Artist/Background Image Layer */}
                      <div className="absolute inset-0" style={{ zIndex: 2 }}>
                        {artistBgUrl && !isBreakTrack ? (
                          <div className="absolute inset-0">
                            <img src={artistBgUrl} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: "saturate(1.2) brightness(0.7)" }} />
                            {config.home.artistOverlayEnabled && (
                              <div className="absolute inset-0" style={{ opacity: (config.home.artistOverlayOpacity ?? 60) / 100, background: config.home.artistOverlayColor || "#000000" }} />
                            )}
                          </div>
                        ) : config.home.bgImage ? (
                          <img src={config.home.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ filter: "brightness(0.7)" }} />
                        ) : null}
                      </div>

                      {/* Program Thumb Layer */}
                      <div className="absolute inset-0" style={{ zIndex: 3 }}>
                        {(currentProgram?.thumb || currentProgram?.capa) && (
                          <div className="absolute inset-0">
                            <img 
                              src={(currentProgram.thumb || currentProgram.capa) as string} 
                              alt="" 
                              className="absolute inset-0 w-full h-full object-cover" 
                              style={{ 
                                filter: config.bgAlternateMode ? "brightness(0.7)" : "blur(22px) brightness(0.7)", 
                                objectPosition: config.programThumbPosition || "center",
                                opacity: config.bgAlternateMode ? 1 : 0.8 // Em modo estático fica com blur atrás
                              }} 
                            />
                            {config.thumbOverlayEnabled && (
                              <div className="absolute inset-0" style={{ opacity: (config.thumbOverlayOpacity ?? 60) / 100, background: config.thumbOverlayColor || "#000000" }} />
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}>
                      {/* Clock — aligned with progress bar */}
                      <div style={{ position: "absolute", top: `${pvh(3.5)}px`, left: `${pvh(4)}px`, color: "#fff", zIndex: 30, textShadow: "0 2px 10px rgba(0,0,0,0.5)" }}>
                        <div style={{ fontSize: `${pvh(3.5)}px`, fontWeight: 800, lineHeight: 1, letterSpacing: "-0.02em" }}>
                          {currentTime.getHours().toString().padStart(2, "0")}:{currentTime.getMinutes().toString().padStart(2, "0")}
                        </div>
                        <div style={{ fontSize: `${pvh(1.2)}px`, fontWeight: 600, opacity: 0.8, textTransform: "uppercase", letterSpacing: "0.05em", marginTop: "2px" }}>
                          {currentTime.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
                        </div>
                      </div>

                      {/* Boxes Area (Simplified Preview) */}
                      <div style={{ position: "absolute", top: `${pvh(3.5)}px`, right: `${pvh(4)}px`, width: `${pvh(14)}px`, height: `${pvh(14)}px`, borderRadius: `${pvh(2)}px`, overflow: "hidden", background: "rgba(255,255,255,0.1)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.2)", zIndex: 20 }}>
                        {currentProgram?.thumb || currentProgram?.capa ? (
                          <img src={currentProgram.thumb || currentProgram.capa} className="w-full h-full object-cover" alt="" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[8px] text-white/40 uppercase">Sem Capa</div>
                        )}
                      </div>

                      {/* Progress bar — elegant, thin, user-accented */}
                      <div style={{ position: "absolute", bottom: `${pvh(1.2)}px`, left: `${pvh(4)}px`, right: `${pvh(4)}px`, height: `${pvh(0.3)}px`, background: "rgba(255,255,255,0.1)", zIndex: 25, overflow: "hidden", borderRadius: "100px" }}>
                        <div style={{ width: `${(() => {
                          if (!currentProgram) return 30; // Default for preview
                          const [sh, sm] = currentProgram.horario_inicio.split(":").map(Number);
                          const [eh, em] = currentProgram.horario_fim.split(":").map(Number);
                          const startMin = sh * 60 + sm;
                          const endMin = eh * 60 + em;
                          const nowMin = currentTime.getHours() * 60 + currentTime.getMinutes();
                          const total = endMin - startMin;
                          return total > 0 ? Math.min(100, Math.max(0, ((nowMin - startMin) / total) * 100)) : 30;
                        })()}%`, height: "100%", borderRadius: "100px", background: "var(--layout-accent-color, #3b82f6)", transition: "width 1s linear", boxShadow: "0 0 8px var(--layout-accent-color, #3b82f6)" }} />
                      </div>
                    </div>
                    
                    {/* Drawing Canvas */}
                    <canvas ref={previewCanvasRef} className="absolute inset-0 w-full h-full" style={{ zIndex: 40, pointerEvents: previewDrawActive ? "auto" : "none" }} onMouseDown={handlePreviewDrawStart} onMouseMove={handlePreviewDrawMove} onMouseUp={handlePreviewDrawEnd} onMouseLeave={() => previewIsDrawingRef.current && handlePreviewDrawEnd()} onTouchStart={handlePreviewDrawStart} onTouchMove={handlePreviewDrawMove} onTouchEnd={handlePreviewDrawEnd} />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
