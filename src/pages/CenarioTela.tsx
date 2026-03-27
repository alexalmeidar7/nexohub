import { useState, useEffect, useRef } from "react";
import { Home, CloudSun, Car, DollarSign, MessageCircle, Thermometer, Droplets, CalendarDays, TrendingUp, TrendingDown, Minus, Loader2, ChevronUp, ChevronDown } from "lucide-react";
import { WeatherIcon } from "@/components/WeatherIcons";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { usePageTitle } from "@/hooks/usePageTitle";

/* ─── types (mirrored from CenarioInterativoPage) ─── */
interface WeatherConfig { enabled: boolean; showCurrent: boolean; showForecast3Days: boolean; showSatellite: boolean; city: string; bgImage: string; }
interface TrafficConfig { enabled: boolean; city: string; points: any[]; bgImage: string; }
interface CurrencyConfig { enabled: boolean; currencies: string[]; bgImage: string; }
interface ChatConfig { enabled: boolean; youtubeVideoUrl: string; bgImage: string; }
interface HomeConfig { bgImage: string; }
interface CenarioConfig { city: string; home: HomeConfig; weather: WeatherConfig; traffic: TrafficConfig; currency: CurrencyConfig; chat: ChatConfig; }

const defaultConfig: CenarioConfig = {
  city: "", home: { bgImage: "" },
  weather: { enabled: true, showCurrent: true, showForecast3Days: true, showSatellite: false, city: "", bgImage: "" },
  traffic: { enabled: false, city: "", points: [], bgImage: "" },
  currency: { enabled: true, currencies: ["USD", "EUR"], bgImage: "" },
  chat: { enabled: false, youtubeVideoUrl: "", bgImage: "" },
};

const CURRENCY_OPTIONS = [
  { value: "USD", label: "Dólar Comercial (USD)" }, { value: "EUR", label: "Euro (EUR)" },
  { value: "GBP", label: "Libra Esterlina (GBP)" }, { value: "ARS", label: "Peso Argentino (ARS)" },
  { value: "JPY", label: "Iene Japonês (JPY)" }, { value: "BTC", label: "Bitcoin (BTC)" }, { value: "ETH", label: "Ethereum (ETH)" },
];

const CURRENCY_API_MAP: Record<string, string> = {
  USD: "USD-BRL", EUR: "EUR-BRL", GBP: "GBP-BRL", ARS: "ARS-BRL", JPY: "JPY-BRL", BTC: "BTC-BRL", ETH: "ETH-BRL",
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

  const [config, setConfig] = useState<CenarioConfig>(defaultConfig);
  const [activeTab, setActiveTab] = useState(() => {
    if (typeof window === "undefined") return "home";
    return new URLSearchParams(window.location.search).get("tab") || "home";
  });
  const [weatherSubTab, setWeatherSubTab] = useState(() => {
    if (typeof window === "undefined") return "today";
    return new URLSearchParams(window.location.search).get("weatherSubTab") || "today";
  });
  const [currentTime, setCurrentTime] = useState(new Date());
  const [currentProgram, setCurrentProgram] = useState<{ nome: string; id: string } | null>(null);
  const [sponsorLogos, setSponsorLogos] = useState<{ id: string; nome: string; logo_url: string }[]>([]);
  const [liveWeather, setLiveWeather] = useState<LiveWeather | null>(null);
  const [weatherCoords, setWeatherCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [trafficCoords, setTrafficCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [liveCurrencies, setLiveCurrencies] = useState<LiveCurrency[]>([]);

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

  /* Load config from DB + poll every 10s */
  useEffect(() => {
    if (!user?.id) return;
    const load = async () => {
      const { data } = await supabase.from("user_settings").select("cenario_config" as any).eq("user_id", user.id).maybeSingle();
      if ((data as any)?.cenario_config && typeof (data as any).cenario_config === "object") {
        const merged = { ...defaultConfig, ...((data as any).cenario_config as Partial<CenarioConfig>) };
        setConfig(merged);
        try {
          localStorage.setItem("cenario_interativo_config_cache_v1", JSON.stringify(merged));
        } catch {
          // silent
        }
      }
    };
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [user?.id]);

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
    if (!user?.id) return;
    const load = async () => {
      const now = new Date();
      const dayNames = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      const today = dayNames[now.getDay()];
      const nowTime = now.toTimeString().slice(0, 5);
      const { data: progs } = await supabase.from("programas").select("id, nome, horario_inicio, horario_fim, dias_semana").eq("user_id", user.id).eq("ativo", true);
      const onAir = progs?.find(p => (p.dias_semana || []).includes(today) && p.horario_inicio <= nowTime && p.horario_fim > nowTime);
      if (onAir) {
        setCurrentProgram({ nome: onAir.nome, id: onAir.id });
        const { data: logos } = await supabase.from("logos_patrocinadores").select("id, nome, logo_url").eq("programa_id", onAir.id).eq("user_id", user.id).eq("ativo", true).eq("excluido", false);
        setSponsorLogos(logos || []);
      } else { setCurrentProgram(null); setSponsorLogos([]); }
    };
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [user?.id]);

  /* Fetch weather */
  const weatherCity = config.weather.city || config.city;
  const weatherFetchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!config.weather.enabled || !weatherCity) return;
    if (weatherFetchRef.current) clearTimeout(weatherFetchRef.current);
    weatherFetchRef.current = setTimeout(async () => {
      try {
        const { data: geoData } = await supabase.functions.invoke("fetch-weather", { body: { action: "geocode", query: weatherCity, count: 1 } });
        const results = geoData?.results;
        if (!results?.length) return;
        const { latitude, longitude } = results[0];
        setWeatherCoords({ lat: latitude, lon: longitude });
        const { data: forecastData } = await supabase.functions.invoke("fetch-weather", { body: { action: "forecast", lat: latitude, lon: longitude, forecast_days: 5 } });
        if (forecastData?.ok && forecastData.data) {
          const d = forecastData.data;
          setLiveWeather({
            current: { temp: Math.round(d.current?.temperature_2m ?? 0), humidity: Math.round(d.current?.relative_humidity_2m ?? 0), code: d.current?.weather_code ?? 0 },
            daily: (d.daily?.time || []).map((date: string, i: number) => ({ date, min: Math.round(d.daily.temperature_2m_min?.[i] ?? 0), max: Math.round(d.daily.temperature_2m_max?.[i] ?? 0), code: d.daily.weather_code?.[i] ?? 0, humidity: Math.round(d.daily.relative_humidity_2m_max?.[i] ?? 0), precip: Math.round(d.daily.precipitation_probability_max?.[i] ?? 0) })),
          });
        }
      } catch { /* silent */ }
    }, 500);
    return () => { if (weatherFetchRef.current) clearTimeout(weatherFetchRef.current); };
  }, [config.weather.enabled, weatherCity]);

  /* Geocode traffic */
  const trafficCity = config.traffic.city || config.city;
  useEffect(() => {
    if (!config.traffic.enabled || !trafficCity) { setTrafficCoords(null); return; }
    const t = setTimeout(async () => {
      try {
        const { data: geoData } = await supabase.functions.invoke("fetch-weather", { body: { action: "geocode", query: trafficCity, count: 1 } });
        if (geoData?.results?.length) setTrafficCoords({ lat: geoData.results[0].latitude, lon: geoData.results[0].longitude });
      } catch { /* silent */ }
    }, 500);
    return () => clearTimeout(t);
  }, [config.traffic.enabled, trafficCity]);

  /* Listen for sync messages from config page via BroadcastChannel */
  useEffect(() => {
    const bc = new BroadcastChannel("cenario-interativo");
    bc.onmessage = (ev) => {
      if (ev.data?.type === "tab-change") {
        setActiveTab(ev.data.tab);
        if (ev.data.subTab) setWeatherSubTab(ev.data.subTab);
        if (ev.data.currencySubTab) setCurrencySubTab(ev.data.currencySubTab);
      }

      if (ev.data?.type === "config-update" && ev.data.config && typeof ev.data.config === "object") {
        setConfig(prev => ({ ...prev, ...(ev.data.config as Partial<CenarioConfig>) }));
      }
    };
    return () => bc.close();
  }, []);

  const isMapTab = (activeTab === "weather" && weatherSubTab === "satellite" && config.weather.showSatellite) || (activeTab === "traffic" && config.traffic.enabled);

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center">
      <div className="relative h-full" style={{ aspectRatio: "9/16", maxHeight: "100vh" }}>
        <div className="absolute inset-0 flex" style={{ fontSize: "1.8vh" }}>

          {/* Satellite fullscreen — behind sidebar */}
          {activeTab === "weather" && weatherSubTab === "satellite" && config.weather.showSatellite && weatherCoords && (
            <iframe
              src={`https://embed.windy.com/embed.html?type=map&location=coordinates&metricRain=mm&metricTemp=°C&metricWind=km/h&zoom=4&overlay=satellite&product=satellite&level=surface&lat=-14.2&lon=-51.9&detailLat=${weatherCoords.lat}&detailLon=${weatherCoords.lon}&marker=true&message=true&autoplay=true&border=full`}
              className="absolute inset-0 w-full h-full border-0" title="Satélite" style={{ zIndex: 1 }}
            />
          )}

          {/* Traffic fullscreen */}
          {activeTab === "traffic" && config.traffic.enabled && trafficCoords && (
            <div className="absolute inset-0 overflow-hidden" style={{ zIndex: 1 }}>
              <iframe
                src={`https://embed.waze.com/iframe?zoom=13&lat=${trafficCoords.lat}&lon=${trafficCoords.lon}&pin=1`}
                className="absolute border-0" style={{ top: 0, left: 0, width: '100%', height: 'calc(100% + 80px)' }}
                title="Trânsito"
              />
            </div>
          )}

          {/* Sidebar — always on top */}
          <div className="flex-shrink-0 flex flex-col items-center py-[3vh] px-[0.8vh] gap-[0.8vh] relative" style={{ width: "11%", background: isMapTab ? "rgba(26,26,26,0.7)" : "#1a1a1a", zIndex: 10, backdropFilter: isMapTab ? "blur(4px)" : "none" }}>
            <button onClick={() => setActiveTab("home")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: "5vh", height: "5vh", background: "rgba(255,255,255,0.12)", border: activeTab === "home" ? "2px solid #e1f532" : "2px solid transparent", animation: activeTab === "home" ? "cenario-active-blink 1.5s ease-in-out infinite" : "none" }}>
              <Home style={{ width: "2.2vh", height: "2.2vh" }} className="text-white" />
            </button>
            <div className="rounded-2xl flex flex-col items-center gap-[0.5vh]" style={{ padding: "0.5vh", background: "rgba(255,255,255,0.08)", opacity: config.weather.enabled ? 1 : 0.35 }}>
              <button onClick={() => { setActiveTab("weather"); setWeatherSubTab("today"); }} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: "5vh", height: "5vh", background: "rgba(255,255,255,0.12)", border: activeTab === "weather" ? "2px solid #e1f532" : "2px solid transparent", animation: activeTab === "weather" ? "cenario-active-blink 1.5s ease-in-out infinite" : "none" }}>
                <CloudSun style={{ width: "2.2vh", height: "2.2vh" }} className="text-white" />
              </button>
              {config.weather.enabled && config.weather.showCurrent && (
                <button onClick={() => { setActiveTab("weather"); setWeatherSubTab("today"); }} className="rounded-full flex items-center justify-center text-white font-bold cursor-pointer" style={{ width: "3.8vh", height: "3.8vh", fontSize: "1.5vh", background: activeTab === "weather" && weatherSubTab === "today" ? "rgba(225,245,50,0.25)" : "rgba(255,255,255,0.12)", border: activeTab === "weather" && weatherSubTab === "today" ? "1px solid rgba(225,245,50,0.5)" : "1px solid transparent" }}>1</button>
              )}
              {config.weather.enabled && config.weather.showForecast3Days && (
                <button onClick={() => { setActiveTab("weather"); setWeatherSubTab("forecast"); }} className="rounded-full flex items-center justify-center text-white font-bold cursor-pointer" style={{ width: "3.8vh", height: "3.8vh", fontSize: "1.5vh", background: activeTab === "weather" && weatherSubTab === "forecast" ? "rgba(225,245,50,0.25)" : "rgba(255,255,255,0.12)", border: activeTab === "weather" && weatherSubTab === "forecast" ? "1px solid rgba(225,245,50,0.5)" : "1px solid transparent" }}>2</button>
              )}
              {config.weather.enabled && config.weather.showSatellite && (
                <button onClick={() => { setActiveTab("weather"); setWeatherSubTab("satellite"); }} className="rounded-full flex items-center justify-center text-white font-bold cursor-pointer" style={{ width: "3.8vh", height: "3.8vh", fontSize: "1.5vh", background: activeTab === "weather" && weatherSubTab === "satellite" ? "rgba(225,245,50,0.25)" : "rgba(255,255,255,0.12)", border: activeTab === "weather" && weatherSubTab === "satellite" ? "1px solid rgba(225,245,50,0.5)" : "1px solid transparent" }}>3</button>
              )}
            </div>
            <button onClick={() => setActiveTab("traffic")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: "5vh", height: "5vh", marginTop: "1vh", background: "rgba(255,255,255,0.12)", opacity: config.traffic.enabled ? 1 : 0.35, border: activeTab === "traffic" ? "2px solid #e1f532" : "2px solid transparent", animation: activeTab === "traffic" ? "cenario-active-blink 1.5s ease-in-out infinite" : "none" }}>
              <Car style={{ width: "2.2vh", height: "2.2vh" }} className="text-white" />
            </button>
            <button onClick={() => setActiveTab("currency")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: "5vh", height: "5vh", background: "rgba(255,255,255,0.15)", opacity: config.currency.enabled ? 1 : 0.35, border: activeTab === "currency" ? "2px solid #e1f532" : "2px solid transparent", animation: activeTab === "currency" ? "cenario-active-blink 1.5s ease-in-out infinite" : "none" }}>
              <DollarSign style={{ width: "2.2vh", height: "2.2vh" }} className="text-white" />
            </button>
            <button onClick={() => setActiveTab("chat")} className="rounded-full flex items-center justify-center cursor-pointer" style={{ width: "5vh", height: "5vh", background: "rgba(255,255,255,0.15)", opacity: config.chat.enabled ? 1 : 0.35, border: activeTab === "chat" ? "2px solid #e1f532" : "2px solid transparent", animation: activeTab === "chat" ? "cenario-active-blink 1.5s ease-in-out infinite" : "none" }}>
              <MessageCircle style={{ width: "2.2vh", height: "2.2vh" }} className="text-white" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 relative" style={{ background: isMapTab ? "transparent" : "#e8e8e8", zIndex: 1 }}>
            {/* Bg images */}
            {activeTab === "home" && config.home.bgImage && <img src={config.home.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
            {activeTab === "weather" && config.weather.bgImage && <img src={config.weather.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
            {activeTab === "traffic" && config.traffic.bgImage && <img src={config.traffic.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
            {activeTab === "currency" && config.currency.bgImage && <img src={config.currency.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}
            {activeTab === "chat" && config.chat.bgImage && <img src={config.chat.bgImage} alt="" className="absolute inset-0 w-full h-full object-cover" />}

            {/* ═══ HOME ═══ */}
            {activeTab === "home" && (
              <div className="absolute inset-0 flex flex-col justify-center" style={{ padding: "3vh", color: config.home.bgImage ? "#fff" : "#333" }}>
                <div className="font-bold leading-none drop-shadow-md" style={{ fontSize: "6vh", fontVariantNumeric: "tabular-nums" }}>
                  {currentTime.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
                <div className="mt-1 drop-shadow-sm opacity-80" style={{ fontSize: "1.8vh" }}>
                  {currentTime.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </div>
                {currentProgram && <div className="mt-2 font-semibold drop-shadow-sm opacity-90" style={{ fontSize: "1.6vh" }}>{currentProgram.nome}</div>}
                {sponsorLogos.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {sponsorLogos.map(l => l.logo_url && <img key={l.id} src={l.logo_url} alt={l.nome} className="object-contain rounded drop-shadow-md" style={{ width: "5vh", height: "5vh", background: "rgba(255,255,255,0.15)", padding: 2 }} />)}
                  </div>
                )}
              </div>
            )}

            {/* ═══ WEATHER ═══ */}
            {activeTab === "weather" && (
              <div className="absolute inset-0 flex flex-col overflow-hidden" style={{ color: "#fff" }}>
                {!config.weather.bgImage && <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, #4fc3f7 0%, #29b6f6 40%, #81d4fa 70%, #e1f5fe 100%)" }} />}
                <div className="absolute bottom-0 left-0 right-0 h-1/4" style={{ background: "linear-gradient(to top, rgba(200,230,0,0.35), transparent)" }} />
                <div className="relative z-10 flex flex-col h-full" style={{ padding: "3vh" }}>
                  {liveWeather ? (<>
                    {weatherSubTab === "today" && (<>
                      <div className="flex justify-end mb-0"><WeatherIcon code={liveWeather.current.code} size={56} /></div>
                      <div style={{ marginBottom: "2vh" }}>
                        <div className="font-extrabold leading-tight drop-shadow-lg" style={{ fontSize: "4vh" }}>{weatherCity || config.city || "Cidade"}</div>
                        <div className="font-bold" style={{ fontSize: "2.5vh", color: "#e1f532" }}>hoje</div>
                      </div>
                      <div className="flex-1 rounded-xl flex flex-col items-start" style={{ padding: "2.5vh", gap: "1.5vh", background: "rgba(255,255,255,0.18)", backdropFilter: "blur(14px)", border: "1px solid rgba(255,255,255,0.25)" }}>
                        <div className="flex items-center justify-center drop-shadow-xl" style={{ width: "12vh", height: "12vh" }}>
                          <WeatherIcon code={liveWeather.current.code} size={96} forceDay />
                        </div>
                        <div className="flex items-center gap-1.5 text-white"><Thermometer style={{ width: "2vh", height: "2vh" }} /><span className="font-extrabold" style={{ fontSize: "2.5vh" }}>{liveWeather.daily[0]?.min ?? "--"}° / {liveWeather.daily[0]?.max ?? "--"}°</span></div>
                        <div className="font-semibold text-white drop-shadow-sm" style={{ fontSize: "1.8vh" }}>{getWLabel(liveWeather.current.code)}</div>
                        <div className="flex items-center gap-3 text-white" style={{ fontSize: "1.6vh" }}>
                          <span className="flex items-center gap-0.5"><Droplets style={{ width: "1.6vh", height: "1.6vh" }} /> {liveWeather.current.humidity}%</span>
                          <span className="flex items-center gap-0.5">🌧 {liveWeather.daily[0]?.precip ?? 0}%</span>
                        </div>
                        <div className="w-full" style={{ paddingTop: "1.5vh", borderTop: "1px solid rgba(255,255,255,0.3)" }}>
                          <div className="text-white font-semibold uppercase tracking-wider" style={{ fontSize: "1.4vh" }}>tempo atual</div>
                          <div className="font-black text-white drop-shadow-lg" style={{ fontSize: "5vh" }}>{liveWeather.current.temp}°C</div>
                        </div>
                      </div>
                    </>)}
                    {weatherSubTab === "forecast" && (<>
                      <div className="flex justify-end mb-1"><CalendarDays size={48} className="drop-shadow-lg" style={{ color: "#fff" }} /></div>
                      <div style={{ marginBottom: "2vh" }}>
                        <div className="font-extrabold leading-tight drop-shadow-lg" style={{ fontSize: "4vh" }}>{weatherCity || config.city || "Cidade"}</div>
                        <div className="font-bold" style={{ fontSize: "2.5vh", color: "#e1f532" }}>próximos dias</div>
                      </div>
                      <div className="flex-1 rounded-xl space-y-2" style={{ padding: "2.5vh", background: "rgba(255,255,255,0.2)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.3)" }}>
                        {liveWeather.daily.slice(1, 4).map((d, i) => (
                          <div key={i} className="flex items-center justify-between rounded-lg" style={{ fontSize: "1.8vh", padding: "1.2vh 1.5vh", background: "rgba(255,255,255,0.15)" }}>
                            <span className="font-bold">{new Date(d.date + "T12:00").toLocaleDateString("pt-BR", { weekday: "short", day: "numeric" })}</span>
                            <span style={{ fontSize: "3vh" }}>{getWIcon(d.code)}</span>
                            <span>↓{d.min}° ↑{d.max}°</span>
                          </div>
                        ))}
                      </div>
                    </>)}
                    {weatherSubTab === "satellite" && (
                      <div className="flex-1 flex flex-col items-center justify-center text-center text-white drop-shadow-lg">
                        <div className="font-bold" style={{ fontSize: "3vh" }}>{weatherCity || config.city || "—"}</div>
                        <div className="opacity-70 mt-1" style={{ fontSize: "1.5vh" }}>Satélite em tempo real</div>
                      </div>
                    )}
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
                {config.traffic.enabled && trafficCoords ? (
                  <div className="text-center text-white drop-shadow-lg">
                    <div className="font-bold" style={{ fontSize: "3vh" }}>{config.traffic.city || config.city || "—"}</div>
                    <div className="opacity-70 mt-1" style={{ fontSize: "1.5vh" }}>Trânsito em tempo real</div>
                  </div>
                ) : (
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
                      <div className="flex-1 space-y-2 overflow-auto" style={{ padding: "2.2vh" }}>
                        {config.currency.currencies.map((c, idx) => {
                          const opt = CURRENCY_OPTIONS.find(o => o.value === c);
                          const live = liveCurrencies.find(l => l.code === c);
                          return (
                            <div key={c} className={`flex items-center justify-between cenario-anim-row-${Math.min(idx + 1, 8)}`} style={{ fontSize: "1.95vh", padding: "1.25vh 1.4vh" }}>
                              <span className="font-semibold" style={{ maxWidth: "52%", lineHeight: 1.15 }}>{opt?.label?.split("(")[0]?.trim() || c}</span>
                              {live ? (
                                <div className="flex items-center" style={{ gap: "0.8vh" }}>
                                  <span className="font-extrabold" style={{ fontSize: "2.05vh" }}>{live.value}</span>
                                  <span className="font-bold" style={{ fontSize: "1.75vh", color: live.direction === "up" ? "#4ade80" : live.direction === "down" ? "#f87171" : "rgba(255,255,255,0.75)" }}>{live.change}</span>
                                  {live.direction === "up" && <ChevronUp style={{ width: "2.5vh", height: "2.5vh" }} strokeWidth={3} className="cenario-arrow-up" />}
                                  {live.direction === "down" && <ChevronDown style={{ width: "2.5vh", height: "2.5vh" }} strokeWidth={3} className="cenario-arrow-down" />}
                                  {live.direction !== "up" && live.direction !== "down" && <Minus style={{ width: "2vh", height: "2vh", color: "rgba(255,255,255,0.5)" }} />}
                                </div>
                              ) : (
                                <span className="opacity-70">---</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="flex-1 space-y-2 overflow-auto" style={{ padding: "2.2vh" }}>
                        {liveStocks.map((s, idx) => (
                          <div key={s.symbol} className={`flex items-center justify-between cenario-anim-row-${Math.min(idx + 1, 8)}`} style={{ fontSize: "1.95vh", padding: "1.25vh 1.4vh" }}>
                            <span className="font-semibold" style={{ maxWidth: "52%", lineHeight: 1.15 }}>
                              <span style={{ marginRight: "0.5vh" }}>{s.flag}</span>{s.name}
                            </span>
                            <div className="flex items-center" style={{ gap: "0.8vh" }}>
                              <span className="font-extrabold" style={{ fontSize: "2.05vh" }}>{s.value}</span>
                              <span className="font-bold" style={{ fontSize: "1.75vh", color: s.direction === "up" ? "#4ade80" : s.direction === "down" ? "#f87171" : "rgba(255,255,255,0.75)" }}>{s.change}</span>
                              {s.direction === "up" && <ChevronUp style={{ width: "2.5vh", height: "2.5vh" }} strokeWidth={3} className="cenario-arrow-up" />}
                              {s.direction === "down" && <ChevronDown style={{ width: "2.5vh", height: "2.5vh" }} strokeWidth={3} className="cenario-arrow-down" />}
                              {s.direction !== "up" && s.direction !== "down" && <Minus style={{ width: "2vh", height: "2vh", color: "rgba(255,255,255,0.5)" }} />}
                            </div>
                          </div>
                        ))}
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
                    <div className="flex-1 rounded-xl space-y-2" style={{ padding: "2.5vh", background: "rgba(255,255,255,0.12)", backdropFilter: "blur(12px)", border: "1px solid rgba(255,255,255,0.15)" }}>
                      <div className="font-bold opacity-70" style={{ fontSize: "1.8vh", marginBottom: "1vh" }}>mensagens aqui</div>
                      {mockMessages.map((m, i) => (
                        <div key={i} className="rounded-lg" style={{ fontSize: "1.5vh", padding: "1vh 1.5vh", background: "rgba(255,255,255,0.08)" }}>
                          <span className="font-bold">{m.user}: </span>
                          <span className="opacity-80">{m.text}</span>
                        </div>
                      ))}
                    </div>
                  </>) : (
                    <div className="flex-1 flex items-center justify-center opacity-50" style={{ fontSize: "1.8vh" }}>Chat desativado</div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
