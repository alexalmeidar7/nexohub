import { OttSkeletonContent } from "./OttSkeleton";
import { useEffect, useState } from "react";
import { Umbrella } from "lucide-react";
import { playerSupabase } from "@/integrations/supabase/playerClient";

type ForecastDay = {
  date: string;
  code: number;
  min: number | null;
  max: number | null;
  rain: number | null;
};
type Coordinates = { lat: number; lon: number };
const numeric = (x: unknown): number | null => typeof x === "number" && Number.isFinite(x) ? x : null;
const degree = (x: number | null) => x === null ? "—" : `${Math.round(x)}°`;
const dayName = (date: string) => new Intl.DateTimeFormat("pt-BR", {weekday: "short",timeZone:"UTC"})
  .format(new Date(`${date}T12:00:00Z`)).replace(".","").toLowerCase();
const dayNum = (date: string) => date.slice(8,10);
const monthName = (date: string) => new Intl.DateTimeFormat("pt-BR", {month:"short",timeZone:"UTC"})
  .format(new Date(`${date}T12:00:00Z`)).replace(".","").toLowerCase();
function savedCity(): Coordinates | null {
  try {
    const value = localStorage.getItem("nexo_tv_manual_city");
    if (!value) return null;
    const city = JSON.parse(value) as Partial<Coordinates>;
    return typeof city.lat === "number" && typeof city.lon === "number" ? {lat:city.lat,lon:city.lon} : null;
  } catch {return null;}
}
function devicePosition(): Promise<Coordinates | null> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return Promise.resolve(null);
  return new Promise(resolve => navigator.geolocation.getCurrentPosition(
    pos => resolve({lat:pos.coords.latitude,lon:pos.coords.longitude}),
    () => resolve(null),
    {maximumAge:300000,timeout:5000,enableHighAccuracy:false},
  ));
}

/* Traços brancos, animação nos elementos do clima (nunca no tamanho do ícone). */
export function ClimateIcon({code,large=false}:{code:number;large?:boolean}) {
  const sunny = code===0;
  const partly = code===1 || code===2;
  const storm = code>=95;
  const snow = code>=71 && code<=77;
  const wet = (code>=51 && code<=67) || (code>=80 && code<=82) || storm;
  const cloudy = code>=3 && !wet && !snow && !storm;
  return <svg className={`nexo-wx-icon${large?" nexo-wx-icon-large":""}`} viewBox="0 0 80 80" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {(sunny || partly) && <g className="nexo-wx-sun-rays">
      <circle cx={partly ? 29:40} cy={partly ? 27:39} r="13"/>
      {[0,45,90,135,180,225,270,315].map(a=><path key={a} d={partly?"M29 6 v-5":"M40 14 v-7"} transform={`rotate(${a} ${partly?29:40} ${partly?27:39})`}/>)}
    </g>}
    {(!sunny) && <path d="M24 57C13 57 9 48 12 40C14 34 20 31 26 32C29 20 38 17 45 18C57 19 60 28 60 34C72 36 74 52 64 56C62 57 59 57 56 57H24Z"/>}
    {wet && <g className="nexo-wx-drops">
      <path d="M28 63l-4 8"/><path d="M42 62l-4 8"/><path d="M56 63l-4 8"/>
    </g>}
    {snow && <g className="nexo-wx-snow"><path d="M30 63v10m-5-5h10M52 63v10m-5-5h10"/></g>}
    {storm && <path className="nexo-wx-flash" d="M44 43l-10 15h10l-6 16 17-22H44z" fill="currentColor" stroke="none"/>}
    {cloudy && code===45 && <path className="nexo-wx-fog" d="M15 64h50M20 71h37"/>}
  </svg>;
}

export default function NexoTvWeatherPanel({radioUserId}:{radioUserId?:string|null}) {
  const [days,setDays] = useState<ForecastDay[]>([]);
  const [temp,setTemp] = useState<number|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState("");
  const [locationRevision,setLocationRevision] = useState(0);
  useEffect(() => {
    const handleChange = () => setLocationRevision(v => v + 1);
    window.addEventListener("nexo-tv-weather-location-changed", handleChange);
    return () => window.removeEventListener("nexo-tv-weather-location-changed", handleChange);
  }, []);
  useEffect(()=>{
    let disposed=false;
    const fetchForecast=async()=>{
      setLoading(true);setError("");
      try {
        const coords=savedCity() ?? await devicePosition();
        if (disposed) return;
        if (!coords && !radioUserId) throw new Error("Localização indisponível");
        const body=coords ? {action:"forecast",lat:coords.lat,lon:coords.lon,forecast_days:8}
          : {action:"forecast",user_id:radioUserId,forecast_days:8};
        const {data,error:failure} = await playerSupabase.functions.invoke("fetch-weather",{body});
        if (failure || !data?.ok) throw failure || new Error(data?.error||"Previsão indisponível");
        const daily=data.data?.daily;
        if (!Array.isArray(daily?.time) || !daily.time.length) throw new Error("Previsão indisponível");
        const next:ForecastDay[]=daily.time.slice(0,8).map((date:string,i:number)=>({
          date,code:numeric(daily.weather_code?.[i])??0,
          min:numeric(daily.temperature_2m_min?.[i]),max:numeric(daily.temperature_2m_max?.[i]),
          rain:numeric(daily.precipitation_sum?.[i]),
        }));
        if (!disposed) {setDays(next);setTemp(numeric(data.data?.current?.temperature_2m));}
      } catch(e) {
        console.warn("Falha na previsão do tempo",e);
        if (!disposed) setError("Não foi possível carregar a previsão do tempo.");
      } finally {if(!disposed)setLoading(false);}
    };
    void fetchForecast();
    const repeat=window.setInterval(()=>void fetchForecast(),300000);
    return ()=>{disposed=true;window.clearInterval(repeat);};
  },[radioUserId,locationRevision]);
  if (loading && !days.length) return <div className="nexo-tv-weather nexo-tv-weather-loading" role="status">
    <OttSkeletonContent variant="weather"/>
  </div>;
  if (error && !days.length) return <div className="nexo-tv-weather nexo-tv-weather-loading" role="alert">{error}</div>;
  const today=days[0];
  return <div className="nexo-tv-weather" data-nexo-weather-wheel aria-label="Previsão do tempo dos próximos sete dias"
    onWheel={event => {
      const list = event.currentTarget.querySelector<HTMLDivElement>(".nexo-tv-weather-days");
      if (list && list.scrollHeight > list.clientHeight) {
        list.scrollTop += event.deltaY;
        event.stopPropagation();
      }
    }}>
    {today && <div className="nexo-tv-weather-current">
      <div className="nexo-tv-weather-current-copy">
        <strong className="nexo-tv-weather-eyebrow">tempo agora</strong>
        <span className="nexo-tv-weather-degree">{degree(temp)}</span>
        <span>min. {degree(today.min)}</span>
        <span>máx. {degree(today.max)}</span>
        <span className="nexo-tv-weather-rain"><Umbrella aria-hidden="true"/> {today.rain===null?"—":`${Math.round(today.rain)}mm`}</span>
      </div>
      <ClimateIcon code={today.code} large/>
    </div>}
    <div className="nexo-tv-weather-days" role="list" aria-label="Próximos dias">
      {days.slice(1,8).map((day, index)=><button type="button" key={day.date} className="nexo-tv-weather-day" data-forecast-card
        onFocus={event => event.currentTarget.scrollIntoView({block:"nearest",inline:"nearest"})}
        aria-label={`Previsão de ${dayNum(day.date)} de ${monthName(day.date)}: mínima ${degree(day.min)}, máxima ${degree(day.max)}`}
        onKeyDown={event => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          event.preventDefault();
          event.stopPropagation();
          const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button.nexo-tv-weather-day");
          const next = Math.max(0, Math.min(days.length - 2, index + (event.key === "ArrowDown" ? 1 : -1)));
          const target = buttons?.item(next);
          target?.focus({ preventScroll: true });
          target?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }}>
        <span><b>{dayNum(day.date)} {monthName(day.date)}</b> {dayName(day.date)}</span>
        <ClimateIcon code={day.code}/>
        <strong>{degree(day.min)}/{degree(day.max)}</strong>
      </button>)}
    </div>
  </div>;
}
