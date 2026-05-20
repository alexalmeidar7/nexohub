import { useState, useEffect, useRef, useCallback } from "react";
import { Home, CloudSun, Car, DollarSign, MessageCircle, Thermometer, Droplets, CloudRain, CalendarDays, TrendingUp, TrendingDown, Minus, Loader2, ChevronUp, ChevronDown, Pen, Eraser, Clock, Music, Mic, Play } from "lucide-react";
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

const defaultConfig: CenarioConfig = {
  city: "", home: { bgImage: "" },
  weather: { enabled: true, showCurrent: true, showForecast3Days: true, showSatellite: false, city: "", bgImage: "" },
  traffic: { enabled: false, city: "", points: [], bgImage: "", lat: null, lon: null, zoom: 13 },
  currency: { enabled: true, currencies: ["USD", "EUR"], bgImage: "" },
  chat: { enabled: false, youtubeVideoUrl: "", bgImage: "" },
};

export default function CenarioTelaFull() {
  const { user } = useAuth();
  const uidFromUrl = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("uid") : null;
  const effectiveUserId = user?.id || uidFromUrl || null;
  const [config, setConfig] = useState<CenarioConfig>(defaultConfig);

  useEffect(() => {
    if (!effectiveUserId) return;
    const load = async () => {
      const { data } = await supabase.from("user_settings").select("cenario_config" as any).eq("user_id", effectiveUserId).maybeSingle();
      if ((data as any)?.cenario_config) setConfig((data as any).cenario_config);
    };
    load();
  }, [effectiveUserId]);

  return (
    <div className="w-[1920px] h-[1080px] bg-black text-white overflow-hidden relative">
      <div className="absolute inset-0 flex items-center justify-center">
        <h1 className="text-4xl font-bold">Modo Full (1920x1080)</h1>
      </div>
    </div>
  );
}
