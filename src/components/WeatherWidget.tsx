import { useState, useEffect } from "react";
import { Droplets, CloudRain, Thermometer, Sun, Settings } from "lucide-react";

interface WidgetWeather {
  city: string;
  temp: number;
  tempMin: number;
  tempMax: number;
  humidity: number;
  rainChance: number;
  weatherCode: number;
}

const weatherIcons: Record<number, string> = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
  45: "🌫️", 48: "🌫️", 51: "🌦️", 53: "🌦️", 55: "🌧️",
  61: "🌧️", 63: "🌧️", 65: "🌧️", 71: "🌨️", 73: "🌨️", 75: "🌨️",
  80: "🌦️", 81: "🌧️", 82: "⛈️", 95: "⛈️", 96: "⛈️", 99: "⛈️",
};

const weatherLabels: Record<number, string> = {
  0: "Céu limpo", 1: "Parcialmente limpo", 2: "Parcialmente nublado", 3: "Nublado",
  45: "Neblina", 48: "Neblina", 51: "Garoa leve", 53: "Garoa", 55: "Garoa forte",
  61: "Chuva leve", 63: "Chuva moderada", 65: "Chuva forte",
  71: "Neve leve", 73: "Neve", 75: "Neve forte",
  80: "Pancadas leves", 81: "Pancadas", 82: "Pancadas fortes",
  95: "Tempestade", 96: "Tempestade com granizo", 99: "Tempestade severa",
};

function getIcon(code: number) {
  const closest = Object.keys(weatherIcons).map(Number)
    .reduce((prev, curr) => (Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev));
  return weatherIcons[closest] || "🌡️";
}

function getLabel(code: number) {
  const closest = Object.keys(weatherLabels).map(Number)
    .reduce((prev, curr) => (Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev));
  return weatherLabels[closest] || "Desconhecido";
}

const PRIMARY_CITY_KEY = "masterview_primary_city";
const FALLBACK_KEY = "masterview_last_city";

export default function WeatherWidget({ onNavigate }: { onNavigate?: (page: any) => void } = {}) {
  const [weather, setWeather] = useState<WidgetWeather | null>(null);
  const [noCity, setNoCity] = useState(false);

  useEffect(() => {
    let cityName: string | null = null;
    let lat: number | null = null;
    let lon: number | null = null;

    try {
      const primary = JSON.parse(localStorage.getItem(PRIMARY_CITY_KEY) || "null");
      if (primary?.name && primary?.lat && primary?.lon) {
        cityName = primary.name;
        lat = primary.lat;
        lon = primary.lon;
      }
    } catch { /* ignore */ }

    if (!cityName) {
      const fallback = localStorage.getItem(FALLBACK_KEY);
      if (!fallback) {
        setNoCity(true);
        return;
      }
      cityName = fallback;
    }

    const fetchData = async () => {
      try {
        let latitude = lat;
        let longitude = lon;
        let name = cityName!;

        if (!latitude || !longitude) {
          const geoRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=pt`
          );
          const geoData = await geoRes.json();
          if (!geoData.results?.length) return;
          latitude = geoData.results[0].latitude;
          longitude = geoData.results[0].longitude;
          name = geoData.results[0].name;
        }

        const wxRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`
        );
        const wxData = await wxRes.json();

        setWeather({
          city: name,
          temp: Math.round(wxData.current.temperature_2m),
          tempMin: Math.round(wxData.daily.temperature_2m_min[0]),
          tempMax: Math.round(wxData.daily.temperature_2m_max[0]),
          humidity: wxData.current.relative_humidity_2m,
          rainChance: wxData.daily.precipitation_probability_max[0] ?? 0,
          weatherCode: wxData.current.weather_code,
        });
      } catch { /* silent */ }
    };

    fetchData();
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (noCity) {
    return (
      <div className="flex flex-col h-full items-start justify-between">
        <div className="flex items-center gap-1.5 mb-2">
          <Sun size={14} style={{ color: "#268ffa", animationDuration: "8s" }} className="animate-spin" />
          <span className="font-bold text-xs" style={{ color: "#268ffa" }}>TEMPO</span>
        </div>
        <p className="text-xs flex-1 text-white/50">Nenhuma cidade configurada.</p>
        <button
          onClick={() => onNavigate?.("previsao")}
          className="mt-auto flex items-center gap-1.5 text-[10px] font-semibold rounded-lg px-2 py-1 hover:opacity-80 transition-opacity"
          style={{ color: "#268ffa", backgroundColor: "rgba(38,143,250,0.15)" }}
        >
          <Settings size={10} /> Configurar
        </button>
      </div>
    );
  }

  if (!weather) {
    return (
      <div className="flex flex-col h-full animate-pulse">
        <div className="flex items-center gap-1.5 mb-1">
          <div className="w-3.5 h-3.5 rounded-full bg-white/10" />
          <div className="w-12 h-3 rounded bg-white/10" />
        </div>
        <div className="flex items-center gap-2 mb-1">
          <div className="w-8 h-8 rounded bg-white/10" />
          <div className="space-y-1">
            <div className="w-20 h-3.5 rounded bg-white/10" />
            <div className="w-16 h-2.5 rounded bg-white/5" />
          </div>
        </div>
        <div className="w-24 h-10 rounded bg-[#268ffa]/15 mb-1" />
        <div className="flex gap-3">
          <div className="w-16 h-2.5 rounded bg-white/5" />
          <div className="w-10 h-2.5 rounded bg-white/5" />
          <div className="w-10 h-2.5 rounded bg-white/5" />
        </div>
        <div className="mt-auto w-24 h-6 rounded-lg bg-[#268ffa]/10" />
      </div>
    );
  }

  return (
    <div className="rounded-xl flex flex-col h-full">
      <div className="flex items-center gap-1.5 mb-1">
        <Sun size={14} className="animate-spin" style={{ color: "#268ffa", animationDuration: "8s" }} />
        <span className="font-bold text-xs" style={{ color: "#268ffa" }}>TEMPO</span>
      </div>

      <div className="flex items-center gap-2 mb-1">
        <span className="text-3xl leading-none">{getIcon(weather.weatherCode)}</span>
        <div>
          <p className="font-semibold text-sm text-white">{weather.city}</p>
          <p className="text-[10px] text-white/60">{getLabel(weather.weatherCode)}</p>
        </div>
      </div>

      <p className="text-4xl font-bold mb-1" style={{ color: "#268ffa" }}>{weather.temp}°C</p>

      <div className="flex items-center gap-3 text-[10px] flex-wrap text-white/60">
        <div className="flex items-center gap-1">
          <Thermometer size={10} /> ↓{weather.tempMin}° / ↑{weather.tempMax}°
        </div>
        <div className="flex items-center gap-1">
          <Droplets size={10} /> {weather.humidity}%
        </div>
        <div className="flex items-center gap-1">
          <CloudRain size={10} /> {weather.rainChance}%
        </div>
      </div>

      <button
        onClick={() => onNavigate?.("previsao")}
        className="mt-auto flex items-center gap-1.5 text-[10px] font-semibold rounded-lg px-2 py-1 self-start hover:opacity-80 transition-opacity"
        style={{ color: "#268ffa", backgroundColor: "rgba(38,143,250,0.15)" }}
      >
        <Settings size={10} /> Configuração
      </button>
    </div>
  );
}
