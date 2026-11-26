import { OttSkeletonContent } from "./OttSkeleton";
import { useEffect, useRef, useState } from "react";
import { Cloud, CloudDrizzle, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun, Umbrella } from "lucide-react";
import { playerSupabase } from "@/integrations/supabase/playerClient";

type Day = { date: string; min: number | null; max: number | null; rain: number | null; chance: number | null; code: number };
type Coordinates = { lat: number; lon: number };
const MANUAL_CITY_KEY = "nexo_tv_manual_city";

function WeatherSymbol({ code, size = 38 }: { code: number; size?: number }) {
  const Icon = code === 0 ? Sun : code <= 2 ? CloudSun : code === 3 || code === 45 || code === 48 ? Cloud : code >= 71 && code <= 77 ? CloudSnow : code >= 95 ? CloudLightning : code === 51 || code === 53 || code === 55 ? CloudDrizzle : CloudRain;
  return <Icon aria-hidden="true" size={size} strokeWidth={1.4} />;
}
const numberOrNull = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;
function savedLocation(): Coordinates | null {
  try {
    const saved = localStorage.getItem(MANUAL_CITY_KEY);
    if (!saved) return null;
    const parsed: unknown = JSON.parse(saved);
    if (parsed && typeof parsed === "object" && "lat" in parsed && "lon" in parsed && typeof parsed.lat === "number" && typeof parsed.lon === "number") {
      return { lat: parsed.lat, lon: parsed.lon };
    }
  } catch {}
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
function weekdayShort(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)).replace(".", "").toLowerCase();
}
function monthShort(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)).replace(".", "").toLowerCase();
}
function dayNumber(date: string) {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
}

export default function OttWeatherForecast({ radioUserId }: { radioUserId?: string | null }) {
  const [days, setDays] = useState<Day[]>([]);
  const [currentTemp, setCurrentTemp] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const firstRow = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const coords = savedLocation() ?? await deviceLocation();
        if (cancelled) return;
        if (!coords && !radioUserId) throw new Error("Cidade indisponível");
        const body = coords ? { action: "forecast", lat: coords.lat, lon: coords.lon, forecast_days: 7 } : { action: "forecast", user_id: radioUserId, forecast_days: 7 };
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

  useEffect(() => {
    if (days.length > 1) firstRow.current?.focus({ preventScroll: true });
  }, [days.length]);

  if (loading && !days.length) return <OttSkeletonContent variant="weather"/>;
  if (error && !days.length) return <p role="alert">{error}</p>;

  const today = days[0];
  const nextDays = days.slice(1, 7);

  return <div className="ott-weather-forecast-card" aria-label="Previsão do tempo">
    <style>{`
      .ott-weather-forecast-card {
        width: min(calc(470 * var(--ott-u)), 100%);
        margin: 0 auto;
        padding: calc(18 * var(--ott-u));
        border-radius: calc(32 * var(--ott-u));
        background: rgba(58,58,58,.58);
        -webkit-backdrop-filter: blur(calc(18 * var(--ott-u)));
        backdrop-filter: blur(calc(18 * var(--ott-u)));
      }
      .ott-weather-forecast-card .ott-weather-now-card {
        display: grid;
        grid-template-columns: minmax(0,1fr) auto;
        gap: calc(14 * var(--ott-u));
        padding: calc(22 * var(--ott-u));
        border-radius: calc(28 * var(--ott-u));
        background: linear-gradient(135deg, rgba(135,135,135,.72), rgba(92,92,92,.72));
      }
      .ott-weather-forecast-card .ott-weather-now-copy { min-width: 0; }
      .ott-weather-forecast-card .ott-weather-now-label {
        display: block;
        margin-bottom: calc(8 * var(--ott-u));
        text-align: center;
        font-size: calc(16 * var(--ott-u));
        font-weight: 700;
        text-transform: lowercase;
      }
      .ott-weather-forecast-card .ott-weather-now-main {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: calc(16 * var(--ott-u));
      }
      .ott-weather-forecast-card .ott-weather-temp {
        font-size: calc(68 * var(--ott-u));
        line-height: .95;
        font-weight: 300;
        letter-spacing: calc(-2 * var(--ott-u));
      }
      .ott-weather-forecast-card .ott-weather-meta {
        margin-top: calc(8 * var(--ott-u));
        font-size: calc(17 * var(--ott-u));
        line-height: 1.28;
      }
      .ott-weather-forecast-card .ott-weather-rain {
        display: inline-flex;
        align-items: center;
        gap: calc(6 * var(--ott-u));
        margin-top: calc(6 * var(--ott-u));
        font-size: calc(16 * var(--ott-u));
      }
      .ott-weather-forecast-card .ott-weather-rain svg,
      .ott-weather-forecast-card .ott-weather-row-rain svg {
        width: calc(16 * var(--ott-u));
        height: calc(16 * var(--ott-u));
      }
      .ott-weather-forecast-card .ott-weather-now-icon {
        display: grid;
        place-items: center;
        align-self: center;
        color: #d9d9d9;
      }
      .ott-weather-forecast-card .ott-weather-now-icon svg {
        width: calc(110 * var(--ott-u));
        height: calc(110 * var(--ott-u));
      }
      .ott-weather-forecast-card .ott-weather-list {
        display: flex;
        flex-direction: column;
        gap: calc(10 * var(--ott-u));
        margin-top: calc(14 * var(--ott-u));
      }
      .ott-weather-forecast-card .ott-weather-row {
        display: grid;
        grid-template-columns: minmax(0,1fr) auto auto;
        align-items: center;
        gap: calc(14 * var(--ott-u));
        width: 100%;
        min-height: calc(54 * var(--ott-u));
        padding: calc(10 * var(--ott-u)) calc(18 * var(--ott-u));
        border: 0;
        border-radius: calc(999 * var(--ott-u));
        background: rgba(72,72,72,.9);
        color: #fff;
        text-align: left;
      }
      .ott-weather-forecast-card .ott-weather-row:focus,
      .ott-weather-forecast-card .ott-weather-row:focus-visible {
        outline: calc(3 * var(--ott-u)) solid #fff;
        outline-offset: calc(4 * var(--ott-u));
      }
      .ott-weather-forecast-card .ott-weather-row-date {
        display: inline-flex;
        align-items: baseline;
        gap: calc(7 * var(--ott-u));
        min-width: 0;
        font-size: calc(16 * var(--ott-u));
        white-space: nowrap;
      }
      .ott-weather-forecast-card .ott-weather-row-date strong { font-weight: 700; }
      .ott-weather-forecast-card .ott-weather-row-date span:last-child { color: rgba(255,255,255,.7); }
      .ott-weather-forecast-card .ott-weather-row-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        color: #d7d7d7;
      }
      .ott-weather-forecast-card .ott-weather-row-icon svg {
        width: calc(28 * var(--ott-u));
        height: calc(28 * var(--ott-u));
      }
      .ott-weather-forecast-card .ott-weather-row-range {
        display: inline-flex;
        align-items: center;
        gap: calc(8 * var(--ott-u));
        font-size: calc(18 * var(--ott-u));
        font-weight: 700;
        white-space: nowrap;
      }
      .ott-weather-forecast-card .ott-weather-empty {
        padding: calc(30 * var(--ott-u));
        text-align: center;
      }
    `}</style>
    {!today ? <div className="ott-weather-empty">Previsão indisponível.</div> : <>
      <div className="ott-weather-now-card">
        <div className="ott-weather-now-copy">
          <span className="ott-weather-now-label">tempo agora</span>
          <div className="ott-weather-now-main">
            <span className="ott-weather-temp">{currentTemp === null ? "—" : `${Math.round(currentTemp)}°`}</span>
          </div>
          <div className="ott-weather-meta">
            <div>min. {today.min === null ? "—" : `${Math.round(today.min)}°`}</div>
            <div>máx. {today.max === null ? "—" : `${Math.round(today.max)}°`}</div>
          </div>
          <div className="ott-weather-rain"><Umbrella aria-hidden="true"/> {today.rain === null ? "—" : `${Math.round(today.rain)}mm`}</div>
        </div>
        <div className="ott-weather-now-icon"><WeatherSymbol code={today.code} size={88}/></div>
      </div>
      <div className="ott-weather-list" role="group" aria-label="Próximos dias">
        {nextDays.map((day, index) => <button
          key={day.date}
          ref={index === 0 ? firstRow : undefined}
          type="button"
          className="ott-weather-row"
          aria-label={`${dayNumber(day.date)} de ${monthShort(day.date)}, ${weekdayShort(day.date)}, mínima ${day.min ?? "indisponível"} graus e máxima ${day.max ?? "indisponível"} graus`}
        >
          <span className="ott-weather-row-date"><strong>{dayNumber(day.date)} {monthShort(day.date)}</strong><span>{weekdayShort(day.date)}</span></span>
          <span className="ott-weather-row-icon"><WeatherSymbol code={day.code} size={26}/></span>
          <span className="ott-weather-row-range">{day.min === null ? "—" : `${Math.round(day.min)}°`}/{day.max === null ? "—" : `${Math.round(day.max)}°`}</span>
        </button>)}
      </div>
    </>}
  </div>;
}
