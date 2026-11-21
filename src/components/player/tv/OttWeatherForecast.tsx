import { useEffect, useRef, useState } from "react";
import { Cloud, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun, CloudDrizzle } from "lucide-react";
import { playerSupabase } from "@/integrations/supabase/playerClient";

type Day = { date: string; min: number | null; max: number | null; rain: number | null; chance: number | null; code: number };
type Coordinates = { lat: number; lon: number };
const MANUAL_CITY_KEY = "nexo_tv_manual_city";

function WeatherSymbol({ code }: { code: number }) {
  const Icon = code === 0 ? Sun : code <= 2 ? CloudSun : code === 3 || code === 45 || code === 48 ? Cloud : code >= 71 && code <= 77 ? CloudSnow : code >= 95 ? CloudLightning : code === 51 || code === 53 || code === 55 ? CloudDrizzle : CloudRain;
  return <Icon aria-hidden="true" size={38} strokeWidth={1.4} />;
}
const numberOrNull = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
function savedLocation(): Coordinates | null {
  try {
    const saved = localStorage.getItem(MANUAL_CITY_KEY);
    if (!saved) return null;
    const parsed: unknown = JSON.parse(saved);
    if (parsed && typeof parsed === "object" && "lat" in parsed && "lon" in parsed &&
        typeof parsed.lat === "number" && typeof parsed.lon === "number") {
      return { lat: parsed.lat, lon: parsed.lon };
    }
  } catch { /* storage may be unavailable */ }
  return null;
}
function deviceLocation(): Promise<Coordinates | null> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise(resolve => navigator.geolocation.getCurrentPosition(
    position => resolve({ lat: position.coords.latitude, lon: position.coords.longitude }),
    () => resolve(null),
    { timeout: 5000, maximumAge: 300000, enableHighAccuracy: false },
  ));
}
function dateLabel(date: string, today: boolean) {
  if (today) return "HOJE";
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" })
    .format(new Date(`${date}T12:00:00Z`)).replace(".", "").toUpperCase();
}
function formatDate(date: string) {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}
export default function OttWeatherForecast({ radioUserId }: { radioUserId?: string | null }) {
  const [days, setDays] = useState<Day[]>([]);
  const firstCard = useRef<HTMLButtonElement>(null);
  const [currentTemp, setCurrentTemp] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        // Keep the same preference as the header: manual city, device, then station.
        const coords = savedLocation() ?? await deviceLocation();
        if (cancelled) return;
        if (!coords && !radioUserId) throw new Error("Cidade indisponível");
        const body = coords
          ? { action: "forecast", lat: coords.lat, lon: coords.lon, forecast_days: 7 }
          : { action: "forecast", user_id: radioUserId, forecast_days: 7 };
        const { data, error: invokeError } = await playerSupabase.functions.invoke("fetch-weather", { body });
        if (invokeError || !data?.ok) throw invokeError || new Error(data?.error || "Falha na previsão");
        const forecast = data.data;
        const daily = forecast?.daily;
        if (!Array.isArray(daily?.time) || daily.time.length === 0) throw new Error("Previsão indisponível");
        const nextDays: Day[] = daily.time.slice(0, 7).map((date: string, index: number) => ({
          date,
          min: numberOrNull(daily.temperature_2m_min?.[index]),
          max: numberOrNull(daily.temperature_2m_max?.[index]),
          rain: numberOrNull(daily.precipitation_sum?.[index]),
          chance: numberOrNull(daily.precipitation_probability_max?.[index]),
          code: numberOrNull(daily.weather_code?.[index]) ?? 0,
        }));
        if (!cancelled) {
          setDays(nextDays);
          setCurrentTemp(numberOrNull(forecast.current?.temperature_2m));
        }
      } catch (cause) {
        console.warn("Previsão do tempo indisponível", cause);
        if (!cancelled) setError("Não foi possível carregar a previsão do tempo.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const interval = window.setInterval(() => void load(), 300000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [radioUserId]);

  useEffect(() => { if (days.length) firstCard.current?.focus({ preventScroll: true }); }, [days.length]);
  const navigate = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault(); event.stopPropagation();
    const next = Math.max(0, Math.min(days.length - 1, index + (event.key === "ArrowRight" ? 1 : -1)));
    const cards = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[data-forecast-card]");
    cards?.[next]?.focus({ preventScroll: true });
    cards?.[next]?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  };
  if (loading && !days.length) return <p role="status">Carregando previsão…</p>;
  if (error && !days.length) return <p role="alert">{error}</p>;
  return <div className="ott-weather-forecast" aria-label="Previsão para sete dias">
    <style>{`
      /* Painel da previsão: sem fundo, véu ou desfoque sobre o apresentador. */
      .nexo-tv .ott-interactivity-panel-weather,
      .nexo-tv .ott-interactivity-panel-weather.ott-interactivity-rail,
      .nexo-tv .ott-interactivity-panel-weather > header,
      .nexo-tv .ott-interactivity-panel-weather .ott-interaction-content {
        background: transparent !important;
        background-image: none !important;
        box-shadow: none !important;
        backdrop-filter: none !important;
        -webkit-backdrop-filter: none !important;
      }
      .nexo-tv .ott-interactivity-panel-weather::before,
      .nexo-tv .ott-interactivity-panel-weather::after {
        content: none !important;
        display: none !important;
      }
      .ott-weather-forecast { width:100%; max-width:100%; overflow-x:auto; padding:6px 4px 12px; background:transparent!important; scrollbar-width:none; }
      .ott-weather-forecast::-webkit-scrollbar { display:none; }
      .ott-weather-forecast .ott-weather-forecast-row { display:flex; flex-flow:row nowrap; align-items:stretch; gap:14px; width:max-content; }
      .ott-weather-forecast .ott-weather-day {
        box-sizing:border-box!important; position:relative; flex:0 0 180px!important; width:180px!important;
        min-width:180px!important; max-width:180px!important; height:192px!important; min-height:192px!important;
        display:flex!important; flex-direction:column!important; align-items:stretch!important;
        justify-content:space-between!important; padding:17px 16px 14px!important;
        margin:0!important; border:2px solid transparent!important; border-radius:22px!important;
        background:rgba(47,43,52,.66)!important; color:#fff!important; text-align:left!important;
        backdrop-filter:blur(12px) saturate(135%); -webkit-backdrop-filter:blur(12px) saturate(135%);
        box-shadow:none!important; outline:none!important; font:inherit; cursor:pointer;
      }
      .ott-weather-forecast .ott-weather-day:focus,
      .ott-weather-forecast .ott-weather-day:focus-visible { border-color:#fff!important; outline:none!important; }
      .ott-weather-forecast .ott-weather-day-head { display:flex; align-items:center; justify-content:space-between; gap:10px; width:100%; font-size:12px; line-height:1.25; }
      .ott-weather-forecast .ott-weather-day-head strong { font-size:14px; font-weight:700; text-transform:lowercase; }
      .ott-weather-forecast .ott-weather-now { display:inline-block; align-self:flex-start; border-radius:5px; background:#e51b23; padding:3px 6px; font-size:11px; font-weight:700; margin-top:6px; }
      .ott-weather-forecast .ott-weather-day-main { display:flex; align-items:center; justify-content:space-between; gap:14px; width:100%; min-height:52px; margin:10px 0; }
      .ott-weather-forecast .ott-weather-day-main svg { width:34px!important; height:34px!important; flex:0 0 34px; margin-right:2px; }
      .ott-weather-forecast .ott-weather-current { font-size:27px; font-weight:400; white-space:nowrap; }
      .ott-weather-forecast .ott-weather-range { font-size:12px; line-height:1.5; opacity:.95; white-space:nowrap; }
      .ott-weather-forecast .ott-weather-day-footer { display:flex; align-items:center; justify-content:space-between; gap:6px; width:100%; border-top:1px solid rgba(255,255,255,.22); padding-top:10px; margin-top:auto; font-size:11px; white-space:nowrap; }
    `}</style>
    <div className="ott-weather-forecast-row" role="group" aria-label="Dias da previsão">
      {days.map((day, index) => <button key={day.date} ref={index === 0 ? firstCard : undefined} type="button" data-forecast-card className="ott-weather-day" onKeyDown={event => navigate(event, index)} aria-label={`${index === 0 ? "Hoje" : dateLabel(day.date, false)}, ${formatDate(day.date)}, máxima ${day.max ?? "indisponível"} graus, mínima ${day.min ?? "indisponível"} graus`}>
        <div className="ott-weather-day-head"><strong>{index === 0 ? "hoje" : new Intl.DateTimeFormat("pt-BR", { weekday:"long", timeZone:"UTC" }).format(new Date(`${day.date}T12:00:00Z`))}</strong><span>{formatDate(day.date)}</span></div>
        {index === 0 && <span className="ott-weather-now">agora</span>}
        <div className="ott-weather-day-main">{index === 0 ? <span className="ott-weather-current">{currentTemp === null ? "—" : Math.round(currentTemp)}°C</span> : <span className="ott-weather-range">min. {day.min === null ? "—" : Math.round(day.min)}°C<br/>máx. {day.max === null ? "—" : Math.round(day.max)}°C</span>}<WeatherSymbol code={day.code}/></div>
        {index === 0 && <div className="ott-weather-range">min. {day.min === null ? "—" : Math.round(day.min)}°C / máx. {day.max === null ? "—" : Math.round(day.max)}°C</div>}
        <div className="ott-weather-day-footer"><span>☔ {day.rain === null ? "—" : `${day.rain.toFixed(1)}mm`}</span><span>💧 {day.chance === null ? "—" : `${Math.round(day.chance)}%`}</span></div>
      </button>)}
    </div>
  </div>;
}
