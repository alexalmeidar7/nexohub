import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Droplets, CloudRain, Thermometer, Star } from "lucide-react";
import XmlLinkRow from "./XmlLinkRow";

interface WeatherData {
  city: string;
  lat: number;
  lon: number;
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

interface GeoResult {
  name: string;
  admin1?: string;
  country: string;
  latitude: number;
  longitude: number;
}

interface FavoriteCity {
  name: string;
  lat: number;
  lon: number;
  inXml: boolean;
}

const weatherIconsDay: Record<number, string> = {
  0: "☀️", 1: "🌤️", 2: "⛅", 3: "☁️",
  45: "🌫️", 48: "🌫️",
  51: "🌦️", 53: "🌦️", 55: "🌧️",
  61: "🌧️", 63: "🌧️", 65: "🌧️",
  71: "🌨️", 73: "🌨️", 75: "🌨️",
  80: "🌦️", 81: "🌧️", 82: "⛈️",
  95: "⛈️", 96: "⛈️", 99: "⛈️",
};

const weatherIconsNight: Record<number, string> = {
  0: "🌙", 1: "🌙", 2: "☁️", 3: "☁️",
  45: "🌫️", 48: "🌫️",
  51: "🌦️", 53: "🌦️", 55: "🌧️",
  61: "🌧️", 63: "🌧️", 65: "🌧️",
  71: "🌨️", 73: "🌨️", 75: "🌨️",
  80: "🌦️", 81: "🌧️", 82: "⛈️",
  95: "⛈️", 96: "⛈️", 99: "⛈️",
};

function isNightTime(): boolean {
  const hour = new Date().getHours();
  return hour >= 18 || hour < 6;
}

const weatherLabels: Record<number, string> = {
  0: "Céu limpo", 1: "Parcialmente limpo", 2: "Parcialmente nublado", 3: "Nublado",
  45: "Neblina", 48: "Neblina", 51: "Garoa leve", 53: "Garoa", 55: "Garoa forte",
  61: "Chuva leve", 63: "Chuva moderada", 65: "Chuva forte",
  71: "Neve leve", 73: "Neve", 75: "Neve forte",
  80: "Pancadas leves", 81: "Pancadas", 82: "Pancadas fortes",
  95: "Tempestade", 96: "Tempestade com granizo", 99: "Tempestade severa",
};

function getWeatherIcon(code: number, forceDay = false) {
  const icons = (!forceDay && isNightTime()) ? weatherIconsNight : weatherIconsDay;
  const closest = Object.keys(icons).map(Number)
    .reduce((prev, curr) => (Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev));
  return icons[closest] || "🌡️";
}

function getWeatherLabel(code: number) {
  const closest = Object.keys(weatherLabels).map(Number)
    .reduce((prev, curr) => (Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev));
  return weatherLabels[closest] || "Desconhecido";
}

function formatDay(dateStr: string) {
  const date = new Date(dateStr + "T12:00:00");
  return date.toLocaleDateString("pt-BR", { weekday: "short", day: "numeric", month: "short" });
}

const STORAGE_KEY = "masterview_last_city";
const FAVORITES_KEY = "masterview_favorite_cities";
const REFRESH_INTERVAL = 5 * 60 * 1000;

function getFavorites(): FavoriteCity[] {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"); } catch { return []; }
}
function saveFavorites(list: FavoriteCity[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
}

export default function PrevisaoTempo() {
  const [city, setCity] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [favorites, setFavorites] = useState<FavoriteCity[]>(getFavorites);

  // Autocomplete
  const [suggestions, setSuggestions] = useState<GeoResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (query.trim().length < 2) { setSuggestions([]); return; }
    try {
      const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=5&language=pt`);
      const data = await res.json();
      setSuggestions(data.results || []);
      setShowSuggestions(true);
    } catch { setSuggestions([]); }
  }, []);

  const handleCityChange = (value: string) => {
    setCity(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 300);
  };

  const selectSuggestion = (geo: GeoResult) => {
    setCity(geo.name);
    setShowSuggestions(false);
    setSuggestions([]);
    fetchWeatherByCoords(geo.latitude, geo.longitude, geo.name);
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) setShowSuggestions(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const fetchWeatherByCoords = useCallback(async (lat: number, lon: number, name: string, silent = false) => {
    if (!silent) { setLoading(true); setError(""); setWeather(null); }
    try {
      const wxRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,relative_humidity_2m_max&timezone=auto&forecast_days=6`);
      const wxData = await wxRes.json();
      const current: DayWeather = {
        date: "Agora", temp: Math.round(wxData.current.temperature_2m),
        tempMin: Math.round(wxData.daily.temperature_2m_min[0]), tempMax: Math.round(wxData.daily.temperature_2m_max[0]),
        humidity: wxData.current.relative_humidity_2m, rainChance: wxData.daily.precipitation_probability_max[0] ?? 0,
        weatherCode: wxData.current.weather_code,
      };
      const forecast: DayWeather[] = wxData.daily.time.slice(1, 6).map((date: string, i: number) => ({
        date, temp: Math.round((wxData.daily.temperature_2m_max[i + 1] + wxData.daily.temperature_2m_min[i + 1]) / 2),
        tempMin: Math.round(wxData.daily.temperature_2m_min[i + 1]), tempMax: Math.round(wxData.daily.temperature_2m_max[i + 1]),
        humidity: wxData.daily.relative_humidity_2m_max[i + 1] ?? 0, rainChance: wxData.daily.precipitation_probability_max[i + 1] ?? 0,
        weatherCode: wxData.daily.weather_code[i + 1],
      }));
      localStorage.setItem(STORAGE_KEY, name);
      setWeather({ city: name, lat, lon, current, forecast });
    } catch { if (!silent) setError("Erro ao buscar dados meteorológicos."); }
    finally { setLoading(false); }
  }, []);

  const fetchWeather = useCallback(async (searchCity: string, silent = false) => {
    if (!searchCity.trim()) return;
    if (!silent) { setLoading(true); setError(""); setWeather(null); }
    try {
      const geoRes = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(searchCity)}&count=1&language=pt`);
      const geoData = await geoRes.json();
      if (!geoData.results?.length) { setError("Cidade não encontrada."); setLoading(false); return; }
      const { latitude, longitude, name } = geoData.results[0];
      await fetchWeatherByCoords(latitude, longitude, name, silent);
    } catch { if (!silent) setError("Erro ao buscar dados meteorológicos."); setLoading(false); }
  }, [fetchWeatherByCoords]);

  const searchWeather = () => { setShowSuggestions(false); fetchWeather(city); };

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) fetchWeather(saved);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchWeather]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (weather) {
      intervalRef.current = setInterval(() => {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) fetchWeather(saved, true);
      }, REFRESH_INTERVAL);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [weather, fetchWeather]);

  const addFavorite = () => {
    if (!weather) return;
    if (favorites.some(f => f.name === weather.city)) return;
    const updated = [...favorites, { name: weather.city, lat: weather.lat, lon: weather.lon, inXml: false }];
    saveFavorites(updated);
    setFavorites(updated);
  };

  const toggleFavoriteXml = (name: string) => {
    const updated = favorites.map(f => f.name === name ? { ...f, inXml: !f.inXml } : f);
    saveFavorites(updated);
    setFavorites(updated);
  };

  const removeFavorite = (name: string) => {
    const updated = favorites.filter(f => f.name !== name);
    saveFavorites(updated);
    setFavorites(updated);
  };

  const isFavorited = weather ? favorites.some(f => f.name === weather.city) : false;

  

  return (
    <div className="animate-fade-in space-y-8">
      {/* Search with autocomplete */}
      <div className="relative" ref={suggestionsRef}>
        <div className="flex gap-3">
          <input value={city} onChange={(e) => handleCityChange(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && searchWeather()}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="Buscar cidade..."
            className="flex-1 bg-muted border border-border p-3 rounded-lg text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-primary" />
          <button onClick={searchWeather} disabled={loading}
            className="bg-primary text-primary-foreground px-5 py-3 rounded-lg font-bold hover:brightness-95 transition-all flex items-center gap-2 disabled:opacity-50">
            <Search size={18} /> Buscar
          </button>
        </div>
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-16 mt-1 bg-muted border border-border rounded-lg overflow-hidden shadow-lg">
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => selectSuggestion(s)}
                className="w-full text-left px-4 py-2 text-foreground hover:bg-primary/10 transition-colors flex items-center justify-between">
                <span>{s.name}{s.admin1 ? `, ${s.admin1}` : ""}</span>
                <span className="text-muted-foreground text-xs">{s.country}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Favorite cities */}
      {favorites.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {favorites.map(f => (
            <div key={f.name} className="flex items-center gap-2 bg-muted border border-border rounded-lg px-3 py-1.5">
              <input type="checkbox" checked={f.inXml} onChange={() => toggleFavoriteXml(f.name)}
                className="w-3 h-3 accent-primary" title="Incluir no XML" />
              <button onClick={() => { setCity(f.name); fetchWeather(f.name); }}
                className="text-xs text-foreground hover:text-primary transition-colors">{f.name}</button>
              <button onClick={() => removeFavorite(f.name)} className="text-muted-foreground hover:text-destructive text-xs">✕</button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-destructive">{error}</p>}
      {loading && <p className="text-muted-foreground">Buscando...</p>}

      {weather && (
        <>
          <div className="bg-muted rounded-2xl p-6 border border-border">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-2xl font-semibold text-foreground">{weather.city}</h3>
                <p className="text-muted-foreground text-sm">{getWeatherLabel(weather.current.weatherCode)}</p>
              </div>
              <div className="flex items-center gap-3">
                {!isFavorited && (
                  <button onClick={addFavorite}
                    className="flex items-center gap-1 bg-primary/10 text-primary px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-primary/20 transition-all">
                    <Star size={14} /> Favoritar cidade
                  </button>
                )}
                <span className="text-6xl">{getWeatherIcon(weather.current.weatherCode)}</span>
              </div>
            </div>
            <div className="text-5xl font-light text-primary mb-6">{weather.current.temp}°C</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Stat icon={<Thermometer size={16} />} label="Mínima" value={`${weather.current.tempMin}°C`} />
              <Stat icon={<Thermometer size={16} />} label="Máxima" value={`${weather.current.tempMax}°C`} />
              <Stat icon={<Droplets size={16} />} label="Humidade" value={`${weather.current.humidity}%`} />
              <Stat icon={<CloudRain size={16} />} label="Chance de chuva" value={`${weather.current.rainChance}%`} />
            </div>
          </div>

          <div>
            <h4 className="text-lg font-medium text-foreground mb-4">Próximos 5 dias</h4>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              {weather.forecast.map((day) => (
                <div key={day.date} className="bg-muted rounded-xl p-4 border border-border text-center space-y-2">
                  <p className="text-xs text-muted-foreground capitalize">{formatDay(day.date)}</p>
                  <span className="text-3xl block">{getWeatherIcon(day.weatherCode, true)}</span>
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

          <XmlLinkRow label="XML TEMPO" xmlContent={(() => {
            if (!weather) return "";
            const dayToXml = (d: DayWeather, tag: string) =>
              `  <${tag} date="${d.date}">\n    <temperatura>${d.temp}</temperatura>\n    <minima>${d.tempMin}</minima>\n    <maxima>${d.tempMax}</maxima>\n    <humidade>${d.humidity}</humidade>\n    <chance_chuva>${d.rainChance}</chance_chuva>\n    <condicao>${getWeatherLabel(d.weatherCode)}</condicao>\n  </${tag}>`;
            return `<?xml version="1.0" encoding="UTF-8"?>\n<previsao>\n  <cidade>${weather.city}</cidade>\n${dayToXml(weather.current, "atual")}\n${weather.forecast.map((d) => dayToXml(d, "dia")).join("\n")}\n</previsao>`;
          })()} />
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
