import CenarioWeatherGlassIcon, { CenarioWeatherMetricIcon } from "@/components/cenario/CenarioWeatherGlassIcon";
import { MapPin } from "lucide-react";
import { useEffect, useState } from "react";

type WeatherDay = {
  date: string;
  min: number;
  max: number;
  code: number;
  rainMm?: number;
};

type WeatherData = {
  current: { temp: number; humidity: number; code: number };
  daily: WeatherDay[];
};

interface CenarioWeatherLayoutProps {
  weather: WeatherData;
  city: string;
  otherCities?: string[];
  showCurrent?: boolean;
  showForecast3Days?: boolean;
}

const dayLabel = (date: string) => {
  const parsed = new Date(`${date}T12:00:00`);
  const weekday = parsed.toLocaleDateString("pt-BR", { weekday: "short" }).replaceAll(".", "");
  const day = parsed.toLocaleDateString("pt-BR", { day: "2-digit" });
  const month = parsed.toLocaleDateString("pt-BR", { month: "short" }).replaceAll(".", "");
  return `${weekday}. ${day} ${month}.`;
};

const weatherBackgroundForCode = (code: number) => {
  if (code >= 95) return "/cenario-weather-storm.png";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "/cenario-weather-rain.png";
  if (code === 0) return "/cenario-weather-sunny.png";
  if (code === 1 || code === 2) return "/cenario-weather-partly-cloudy.png";
  return "/cenario-weather-cloudy.png";
};

export default function CenarioWeatherLayout({ weather, city, otherCities = [], showCurrent = true, showForecast3Days = true }: CenarioWeatherLayoutProps) {
  const nextBackground = weatherBackgroundForCode(weather.current.code);
  const [backgroundLayers, setBackgroundLayers] = useState<{ current: string; previous: string | null }>(() => ({ current: nextBackground, previous: null }));

  useEffect(() => {
    setBackgroundLayers(layers => layers.current === nextBackground ? layers : { current: nextBackground, previous: layers.current });
    const transitionTimer = window.setTimeout(() => {
      setBackgroundLayers(layers => layers.current === nextBackground ? { ...layers, previous: null } : layers);
    }, 1300);
    return () => window.clearTimeout(transitionTimer);
  }, [nextBackground]);

  const today = weather.daily[0];
  const upcomingDays = weather.daily.slice(1, 4);
  const normalizeCity = (name: string) => name.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const currentCityKey = normalizeCity(city);
  const additionalCities = [...new Set(otherCities.map(name => name.trim()).filter(Boolean))]
    .filter(name => {
      const key = normalizeCity(name);
      return key && key !== currentCityKey && !key.startsWith(currentCityKey) && !currentCityKey.startsWith(key);
    });

  return (
    <div className="absolute inset-0 overflow-hidden" style={{ containerType: "size", color: "#fff", background: "#1687c4" }}>
      <style>{`
        @keyframes scenarioWeatherBackgroundFade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
      {backgroundLayers.previous && <img src={backgroundLayers.previous} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" style={{ zIndex: 0 }} />}
      <img key={backgroundLayers.current} src={backgroundLayers.current} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" style={{ zIndex: 0, animation: backgroundLayers.previous ? "scenarioWeatherBackgroundFade 1.2s ease both" : undefined }} />
      <div className="absolute inset-0" aria-hidden="true" style={{ zIndex: 0.5, background: "rgba(0, 0, 0, 0.7)", pointerEvents: "none" }} />

      <div className="absolute font-extrabold" style={{ left: "18%", top: "6.8%", zIndex: 1, fontSize: "2.7cqh", lineHeight: 1, letterSpacing: "-0.055em" }}>
        tempo:
      </div>

      {showCurrent && (
        <section className="absolute" style={{ left: "18%", top: "14.4%", width: "75%", height: "26%", zIndex: 1, boxSizing: "border-box", padding: "5.8% 6%", borderRadius: "2cqh", background: "rgba(72, 174, 225, 0.62)", border: "1px solid rgba(255,255,255,0.22)", boxShadow: "0 8px 24px rgba(0,70,130,0.12), inset 0 1px 0 rgba(255,255,255,0.12)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)" }}>
          <div className="absolute flex flex-wrap items-center" style={{ top: "8%", left: "6%", right: "6%", gap: "0.8cqh 1cqh" }}>
            <span style={{ flexShrink: 0, fontSize: "2cqh", lineHeight: 1.1, letterSpacing: "-0.04em" }}>agora</span>
            <span className="inline-flex items-center" style={{ maxWidth: "48%", gap: "0.45cqh", padding: "0.55cqh 1.6cqh", borderRadius: "999px", background: "#053c70", fontSize: "1.4cqh", fontWeight: 400, lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={city}>
              <MapPin size="1.25cqh" strokeWidth={2.4} style={{ flexShrink: 0 }} />
              {city || "Goiânia / Goiás"}
            </span>
            {additionalCities.map(name => (
              <span key={name} style={{ maxWidth: "24%", padding: "0.55cqh 0.9cqh", border: "1px solid rgba(255,255,255,0.65)", borderRadius: "0.8cqh", fontSize: "1.5cqh", lineHeight: 1.1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={name}>
                {name}
              </span>
            ))}
          </div>
          <div className="absolute font-black" style={{ top: "35%", left: "7%", fontSize: "8cqh", lineHeight: 0.92, letterSpacing: "-0.075em", textShadow: "0 0.5cqh 0 rgba(20,65,120,0.38)", whiteSpace: "nowrap" }}>
            {Math.round(weather.current.temp)}°C
          </div>
          <div className="absolute font-medium" style={{ top: "70%", left: "8%", padding: "0.4cqh 0.8cqh", borderRadius: "1.1cqh", background: "#053c70", fontSize: "1.2cqh", lineHeight: 1.15, letterSpacing: "-0.025em", whiteSpace: "nowrap" }}>
            min. {today?.min ?? "--"}°C&nbsp; / &nbsp;máx. {today?.max ?? "--"}°C
          </div>
          <div className="absolute" style={{ right: "7%", top: "24%", display: "flex", alignItems: "center", justifyContent: "center", width: "29%", height: "52%" }}>
            <CenarioWeatherGlassIcon code={weather.current.code} size={230} />
          </div>
          <div className="absolute" style={{ left: "7.5%", right: "7.5%", bottom: "6%" }}>
            <div className="flex items-center whitespace-nowrap" style={{ gap: "0.65cqh", fontSize: "1.45cqh", lineHeight: 1.15, letterSpacing: "-0.045em" }}>
              <span className="font-semibold" style={{ flexShrink: 0, fontSize: "inherit" }}>hoje:</span>
              <span className="inline-flex items-center" style={{ gap: "0.35cqh", fontSize: "inherit" }}><CenarioWeatherMetricIcon type="humidity" /><b style={{ fontSize: "inherit" }}>{weather.current.humidity}%</b></span>
              <span style={{ opacity: 0.7 }}>|</span>
              <span className="inline-flex items-center" style={{ gap: "0.35cqh", fontSize: "inherit" }}><CenarioWeatherMetricIcon type="rain" /><b style={{ fontSize: "inherit" }}>{today?.rainMm ?? 0}mm</b></span>
            </div>
          </div>
        </section>
      )}

      {showForecast3Days && upcomingDays.length > 0 && (
        <section className="absolute" style={{ left: "18%", top: "42%", width: "75%", height: "14.5%", zIndex: 1, boxSizing: "border-box", padding: "2.8% 5.5% 3%", borderRadius: "2cqh", background: "rgba(6, 71, 133, 0.68)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.1)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}>
          <div className="font-semibold" style={{ fontSize: "1.45cqh", lineHeight: 1, letterSpacing: "-0.045em", marginBottom: "1.2cqh" }}>próximos 3 dias:</div>
          <div className="grid h-[58%]" style={{ gridTemplateColumns: `repeat(${upcomingDays.length}, minmax(0, 1fr))` }}>
            {upcomingDays.map((day, index) => (
              <div key={day.date} className="relative flex flex-col" style={{ minWidth: 0, padding: "0 1.2cqh", borderLeft: index === 0 ? "none" : "1px solid rgba(255,255,255,0.7)" }}>
                <div className="flex items-center font-semibold" style={{ minHeight: "2.4cqh", marginBottom: "0.6cqh", padding: "0 0.7cqh", borderRadius: "1.1cqh", background: "#053c70", color: "#fff", fontSize: "1.1cqh", whiteSpace: "nowrap", letterSpacing: "-0.035em" }}>
                  <span style={{ color: "#20baff", marginRight: "0.5cqh" }}>{dayLabel(day.date).split(" ")[0]}</span>
                  {dayLabel(day.date).split(" ").slice(1).join(" ")}
                </div>
                <div className="flex flex-1 flex-col" style={{ minHeight: 0 }}>
                  <div className="flex items-center justify-between w-full" style={{ gap: "0.4cqh", minWidth: 0 }}>
                    <div className="flex flex-col items-center font-normal whitespace-nowrap" style={{ fontSize: "1.05cqh", lineHeight: 1, letterSpacing: "-0.025em", gap: "0.35cqh" }}>
                      <span>{day.min}°C</span>
                      <span style={{ width: "100%", minWidth: "4.2cqh", height: "1px", background: "rgba(255,255,255,0.82)" }} />
                      <span>{day.max}°C</span>
                    </div>
                    <div style={{ width: "4.4cqh", height: "4.4cqh", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <CenarioWeatherGlassIcon code={day.code} size={68} />
                    </div>
                  </div>
                  <div className="inline-flex items-center font-medium" style={{ gap: "0.35cqh", fontSize: "0.95cqh", lineHeight: 1, whiteSpace: "nowrap", marginTop: "0.25cqh" }}>
                    <CenarioWeatherMetricIcon type="rain" size="1.25cqh" />
                    <span>{(day.rainMm ?? 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="absolute font-medium" style={{ left: "18%", bottom: "3.5%", zIndex: 1, fontSize: "1.2cqh", lineHeight: 1, letterSpacing: "-0.02em", color: "rgba(255,255,255,0.92)", textShadow: "0 1px 3px rgba(0,45,90,0.7)" }}>
        Fonte: Open-Meteo
      </div>

    </div>
  );
}
