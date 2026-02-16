import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { Search, Droplets, CloudRain, Thermometer, Copy, Check, Code2 } from "lucide-react";

interface WeatherData {
  city: string;
  current: DayWeather;
  forecast: DayWeather[];
}

interface DayWeather {
  date: string;
  temp: number;
  tempMin: number;
  tempMax: number;
  humidity: number;
  rainChance: number;
  weatherCode: number;
}

const weatherIcons: Record<number, string> = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
  45: "🌫️", 48: "🌫️",
  51: "🌦️", 53: "🌦️", 55: "🌧️",
  61: "🌧️", 63: "🌧️", 65: "🌧️",
  71: "🌨️", 73: "🌨️", 75: "🌨️",
  80: "🌦️", 81: "🌧️", 82: "⛈️",
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

function getWeatherIcon(code: number) {
  const closest = Object.keys(weatherIcons)
    .map(Number)
    .reduce((prev, curr) => (Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev));
  return weatherIcons[closest] || "🌡️";
}

function getWeatherLabel(code: number) {
  const closest = Object.keys(weatherLabels)
    .map(Number)
    .reduce((prev, curr) => (Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev));
  return weatherLabels[closest] || "Desconhecido";
}

function formatDay(dateStr: string) {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });
}

const STORAGE_KEY = "masterview_last_city";
const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes

export default function PrevisaoTempo() {
  const [city, setCity] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchWeather = useCallback(async (searchCity: string, silent = false) => {
    if (!searchCity.trim()) return;
    if (!silent) {
      setLoading(true);
      setError("");
      setWeather(null);
    }

    try {
      // Geocoding
      const geoRes = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=pt`
      );
      const geoData = await geoRes.json();

      if (!geoData.results?.length) {
        setError("Cidade não encontrada.");
        setLoading(false);
        return;
      }

      const { latitude, longitude, name } = geoData.results[0];

      // Weather
      const wxRes = await fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,relative_humidity_2m_max&timezone=auto&forecast_days=6`
      );
      const wxData = await wxRes.json();

      const current: DayWeather = {
        date: "Agora",
        temp: Math.round(wxData.current.temperature_2m),
        tempMin: Math.round(wxData.daily.temperature_2m_min[0]),
        tempMax: Math.round(wxData.daily.temperature_2m_max[0]),
        humidity: wxData.current.relative_humidity_2m,
        rainChance: wxData.daily.precipitation_probability_max[0] ?? 0,
        weatherCode: wxData.current.weather_code,
      };

      const forecast: DayWeather[] = wxData.daily.time.slice(1, 6).map((date: string, i: number) => ({
        date,
        temp: Math.round((wxData.daily.temperature_2m_max[i + 1] + wxData.daily.temperature_2m_min[i + 1]) / 2),
        tempMin: Math.round(wxData.daily.temperature_2m_min[i + 1]),
        tempMax: Math.round(wxData.daily.temperature_2m_max[i + 1]),
        humidity: wxData.daily.relative_humidity_2m_max[i + 1] ?? 0,
        rainChance: wxData.daily.precipitation_probability_max[i + 1] ?? 0,
        weatherCode: wxData.daily.weather_code[i + 1],
      }));

      localStorage.setItem(STORAGE_KEY, searchCity);
      setWeather({ city: name, current, forecast });
    } catch {
      if (!silent) setError("Erro ao buscar dados meteorológicos.");
    } finally {
      setLoading(false);
    }
  }, []);

  const searchWeather = () => fetchWeather(city);

  // Load saved city on mount & set up auto-refresh
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      fetchWeather(saved);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [fetchWeather]);

  // Set up refresh interval when weather is loaded
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (weather) {
      intervalRef.current = setInterval(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) fetchWeather(saved, true);
      }, REFRESH_INTERVAL);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [weather, fetchWeather]);

  const xmlUrl = useMemo(() => {
    if (!weather) return "";
    const dayToXml = (d: DayWeather, tag: string) =>
      `    <${tag} date="${d.date}">
      <temperatura>${d.temp}</temperatura>
      <minima>${d.tempMin}</minima>
      <maxima>${d.tempMax}</maxima>
      <humidade>${d.humidity}</humidade>
      <chance_chuva>${d.rainChance}</chance_chuva>
      <condicao>${getWeatherLabel(d.weatherCode)}</condicao>
    </${tag}>`;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<previsao>
  <cidade>${weather.city}</cidade>
${dayToXml(weather.current, "atual")}
${weather.forecast.map((d) => dayToXml(d, "dia")).join("\n")}
</previsao>`;

    const blob = new Blob([xml], { type: "application/xml" });
    return URL.createObjectURL(blob);
  }, [weather]);

  const [copied, setCopied] = useState(false);

  const copyXmlUrl = () => {
    if (!xmlUrl) return;
    navigator.clipboard.writeText(xmlUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="animate-fade-in space-y-8">
      {/* Search */}
      <div className="flex gap-3">
        <input
          value={city}
          onChange={(e) => setCity(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && searchWeather()}
          placeholder="Buscar cidade..."
          className="flex-1 bg-muted border border-border p-3 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary"
        />
        <button
          onClick={searchWeather}
          disabled={loading}
          className="bg-primary text-primary-foreground px-5 py-3 rounded-lg font-bold hover:brightness-95 transition-all flex items-center gap-2 disabled:opacity-50"
        >
          <Search size={18} />
          Buscar
        </button>
      </div>

      {error && <p className="text-destructive">{error}</p>}
      {loading && <p className="text-muted-foreground">Buscando...</p>}

      {weather && (
        <>
          {/* Current Weather */}
          <div className="bg-muted rounded-2xl p-6 border border-border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-2xl font-semibold text-foreground">{weather.city}</h3>
                <p className="text-muted-foreground text-sm">{getWeatherLabel(weather.current.weatherCode)}</p>
              </div>
              <span className="text-6xl">{getWeatherIcon(weather.current.weatherCode)}</span>
            </div>
            <div className="text-5xl font-light text-primary mb-6">{weather.current.temp}°C</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat icon={<Thermometer size={16} />} label="Mínima" value={`${weather.current.tempMin}°C`} />
              <Stat icon={<Thermometer size={16} />} label="Máxima" value={`${weather.current.tempMax}°C`} />
              <Stat icon={<Droplets size={16} />} label="Humidade" value={`${weather.current.humidity}%`} />
              <Stat icon={<CloudRain size={16} />} label="Chance de chuva" value={`${weather.current.rainChance}%`} />
            </div>
          </div>

          {/* 5-day Forecast */}
          <div>
            <h4 className="text-lg font-medium text-foreground mb-4">Próximos 5 dias</h4>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              {weather.forecast.map((day) => (
                <div key={day.date} className="bg-muted rounded-xl p-4 border border-border text-center space-y-2">
                  <p className="text-xs text-muted-foreground capitalize">{formatDay(day.date)}</p>
                  <span className="text-3xl block">{getWeatherIcon(day.weatherCode)}</span>
                  <p className="text-sm text-muted-foreground">{getWeatherLabel(day.weatherCode)}</p>
                  <p className="text-xl font-semibold text-foreground">{day.temp}°C</p>
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>↓ {day.tempMin}° / ↑ {day.tempMax}°</p>
                    <p><Droplets size={12} className="inline mr-1" />{day.humidity}%</p>
                    <p><CloudRain size={12} className="inline mr-1" />{day.rainChance}%</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* XML URL */}
          <div
            onClick={copyXmlUrl}
            className="flex items-center gap-3 bg-muted rounded-xl p-4 border border-border cursor-pointer hover:border-primary transition-colors group"
          >
            <Code2 size={18} className="text-primary shrink-0" />
            <span className="text-sm text-muted-foreground truncate flex-1 font-mono">{xmlUrl}</span>
            {copied ? (
              <Check size={18} className="text-primary shrink-0" />
            ) : (
              <Copy size={18} className="text-muted-foreground group-hover:text-primary shrink-0" />
            )}
          </div>
          {copied && <p className="text-xs text-primary -mt-6">URL copiada!</p>}
        </>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-background/50 rounded-lg p-3 text-center">
      <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <p className="text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}
