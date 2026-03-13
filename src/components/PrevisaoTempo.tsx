import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Droplets, CloudRain, Thermometer, Star, Sparkles, MapPin, Wind } from "lucide-react";
import XmlLinkRow from "./XmlLinkRow";
import { WeatherIcon } from "./WeatherIcons";
import { supabase } from "@/integrations/supabase/client";

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

const weatherLabels: Record<number, string> = {
  0: "Céu limpo", 1: "Parcialmente limpo", 2: "Parcialmente nublado", 3: "Nublado",
  45: "Neblina", 48: "Neblina", 51: "Garoa leve", 53: "Garoa", 55: "Garoa forte",
  61: "Chuva leve", 63: "Chuva moderada", 65: "Chuva forte",
  71: "Neve leve", 73: "Neve", 75: "Neve forte",
  80: "Pancadas leves", 81: "Pancadas", 82: "Pancadas fortes",
  95: "Tempestade", 96: "Tempestade com granizo", 99: "Tempestade severa",
};

function weatherCodeToWbIcon(code: number): string {
  const map: Record<number, string> = {
    0: "c01d", 1: "c02d", 2: "c02d", 3: "c04d",
    45: "a05d", 48: "a05d", 51: "d01d", 53: "d02d", 55: "d03d",
    61: "r01d", 63: "r02d", 65: "r03d", 71: "s01d", 73: "s02d", 75: "s03d",
    80: "r04d", 81: "r05d", 82: "r06d", 95: "t01d", 96: "t04d", 99: "t05d",
  };
  const codes = Object.keys(map).map(Number);
  const closest = codes.reduce((prev, curr) => (Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev));
  return map[closest] || "c01d";
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
const PRIMARY_CITY_KEY = "masterview_primary_city";
const REFRESH_INTERVAL = 5 * 60 * 1000;

interface PrimaryCity {
  name: string;
  lat: number;
  lon: number;
}

function getFavorites(): FavoriteCity[] {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"); } catch { return []; }
}
function saveFavorites(list: FavoriteCity[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
}
function getPrimaryCity(): PrimaryCity | null {
  try { return JSON.parse(localStorage.getItem(PRIMARY_CITY_KEY) || "null"); } catch { return null; }
}
function savePrimaryCity(city: PrimaryCity | null) {
  localStorage.setItem(PRIMARY_CITY_KEY, city ? JSON.stringify(city) : "");
}

export default function PrevisaoTempo() {
  const [city, setCity] = useState(() => localStorage.getItem(STORAGE_KEY) || "");
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [favorites, setFavorites] = useState<FavoriteCity[]>(getFavorites);

  const [primaryCity, setPrimaryCity] = useState<PrimaryCity | null>(getPrimaryCity);
  const [aiDescription, setAiDescription] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [forecastDescription, setForecastDescription] = useState("");
  const [forecastLoading, setForecastLoading] = useState(false);

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
      if (!silent) {
        setAiLoading(true);
        setAiDescription("");
        setForecastDescription("");
        try {
          const { data } = await supabase.functions.invoke("weather-description", {
            body: {
              city: name,
              temp: current.temp,
              tempMin: current.tempMin,
              tempMax: current.tempMax,
              humidity: current.humidity,
              rainChance: current.rainChance,
              condition: getWeatherLabel(current.weatherCode),
            },
          });
          if (data?.description) setAiDescription(data.description);
        } catch { /* ignore AI errors */ }
        setAiLoading(false);
      }
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
    const primary = getPrimaryCity();
    if (primary) {
      setCity(primary.name);
      fetchWeatherByCoords(primary.lat, primary.lon, primary.name);
    } else {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) fetchWeather(saved);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [fetchWeather, fetchWeatherByCoords]);

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
  const isPrimary = weather ? primaryCity?.name === weather.city : false;

  const togglePrimaryCity = () => {
    if (!weather) return;
    if (isPrimary) {
      savePrimaryCity(null);
      setPrimaryCity(null);
    } else {
      const pc = { name: weather.city, lat: weather.lat, lon: weather.lon };
      savePrimaryCity(pc);
      setPrimaryCity(pc);
    }
  };

  const fetchForecastDescription = async () => {
    if (!weather) return;
    setForecastLoading(true);
    setForecastDescription("");
    try {
      const forecastData = weather.forecast.map(d => ({
        date: d.date,
        temp: d.temp,
        tempMin: d.tempMin,
        tempMax: d.tempMax,
        humidity: d.humidity,
        rainChance: d.rainChance,
        condition: getWeatherLabel(d.weatherCode),
      }));
      const { data } = await supabase.functions.invoke("weather-description", {
        body: { type: "forecast", city: weather.city, forecast: forecastData },
      });
      if (data?.description) setForecastDescription(data.description);
    } catch { /* ignore */ }
    setForecastLoading(false);
  };

  return (
    <div className="animate-fade-in space-y-6">
      {/* Favorite cities chips */}
      {(primaryCity || favorites.length > 0) && (
        <div className="flex gap-2 flex-wrap items-center">
          {primaryCity && (
            <button
              onClick={() => { setCity(primaryCity.name); fetchWeatherByCoords(primaryCity.lat, primaryCity.lon, primaryCity.name); }}
              className="flex items-center gap-2 rounded-full px-4 py-2 text-xs font-bold transition-all hover:scale-105"
              style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)", color: "#ffffff", boxShadow: "0 4px 15px rgba(13,4,70,0.3)" }}
            >
              <Star size={12} style={{ color: "#2dbef3" }} />
              {primaryCity.name}
            </button>
          )}
          {favorites.map(f => (
            <div key={f.name} className="flex items-center gap-2 rounded-full px-3 py-1.5 transition-all hover:shadow-md"
              style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.15)" }}>
              <input type="checkbox" checked={f.inXml} onChange={() => toggleFavoriteXml(f.name)}
                className="w-3 h-3" style={{ accentColor: "#2dbef3" }} title="Incluir no XML" />
              <button onClick={() => { setCity(f.name); fetchWeather(f.name); }}
                className="text-xs font-medium transition-colors hover:text-[#2dbef3]"
                style={{ color: "#0d0446" }}
              >{f.name}</button>
              <button onClick={() => removeFavorite(f.name)}
                className="text-xs transition-colors hover:text-red-500"
                style={{ color: "rgba(13,4,70,0.3)" }}
              >✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Search with autocomplete */}
      <div className="relative" ref={suggestionsRef}>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: "rgba(13,4,70,0.4)" }} />
            <input value={city} onChange={(e) => handleCityChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && searchWeather()}
              onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
              placeholder="Buscar cidade..."
              className="w-full pl-10 pr-4 py-2.5 outline-none transition-all text-sm"
              style={{ backgroundColor: "#ffffff", border: "2px solid rgba(13,4,70,0.1)", color: "#0d0446", borderRadius: "16px" }}
              onFocusCapture={e => { e.currentTarget.style.borderColor = "#2dbef3"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(45,190,243,0.1)"; }}
              onBlur={e => { e.currentTarget.style.borderColor = "rgba(13,4,70,0.1)"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>
          <button onClick={searchWeather} disabled={loading}
            className="px-6 py-2.5 font-bold transition-all flex items-center gap-2 disabled:opacity-50 hover:scale-105"
            style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)", color: "#ffffff", borderRadius: "16px", boxShadow: "0 4px 15px rgba(13,4,70,0.25)" }}
          >
            <Search size={16} /> Buscar
          </button>
        </div>
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 mt-2 rounded-xl overflow-hidden"
            style={{ background: "linear-gradient(135deg, #0d0446, #1a0a6e)", marginRight: "110px", boxShadow: "0 10px 40px rgba(13,4,70,0.3)" }}>
            {suggestions.map((s, i) => (
              <button key={i} onClick={() => selectSuggestion(s)}
                className="w-full text-left px-4 py-3 transition-all flex items-center justify-between text-xs border-b border-white/5 last:border-0 hover:bg-white/10"
                style={{ color: "#ffffff" }}
              >
                <span className="flex items-center gap-2">
                  <MapPin size={12} style={{ color: "#2dbef3" }} />
                  {s.name}{s.admin1 ? `, ${s.admin1}` : ""}
                </span>
                <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "10px" }}>{s.country}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="text-sm font-medium" style={{ color: "#dc2626" }}>{error}</p>}

      {/* Loading skeleton */}
      {loading && (
        <div className="animate-pulse space-y-6">
          <div className="rounded-2xl p-6" style={{ background: "linear-gradient(135deg, #0d0446 0%, #1a0a6e 100%)" }}>
            <div className="flex items-center justify-between mb-6">
              <div className="space-y-3">
                <div className="h-6 w-36 rounded-lg bg-white/10" />
                <div className="h-3 w-24 rounded bg-white/5" />
              </div>
              <div className="h-16 w-16 rounded-full bg-white/10" />
            </div>
            <div className="h-14 w-32 rounded-lg bg-white/15 mb-6" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-white/8" />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="rounded-xl p-5 space-y-3" style={{ backgroundColor: "#ffffff", border: "1px solid rgba(13,4,70,0.06)" }}>
                <div className="h-3 w-14 mx-auto rounded bg-[#0d0446]/8" />
                <div className="h-10 w-10 mx-auto rounded-full bg-[#0d0446]/5" />
                <div className="h-4 w-16 mx-auto rounded bg-[#0d0446]/5" />
              </div>
            ))}
          </div>
        </div>
      )}

      {weather && (
        <>
          {/* Current weather — hero card */}
          <div className="rounded-2xl overflow-hidden" style={{ background: "#d9e9fa", boxShadow: "0 8px 32px rgba(13,4,70,0.15)" }}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-5">
                <div className="space-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-2xl font-bold" style={{ color: "#0d0446" }}>{weather.city}</h3>
                    {(!primaryCity || isPrimary) && (
                      <label className="flex items-center gap-2 cursor-pointer select-none rounded-full px-3 py-1 transition-all"
                        style={{ backgroundColor: isPrimary ? "#0d0446" : "rgba(13,4,70,0.08)", border: `1px solid ${isPrimary ? "#0d0446" : "rgba(13,4,70,0.15)"}` }}>
                        <input type="checkbox" checked={isPrimary} onChange={togglePrimaryCity}
                          className="w-3.5 h-3.5" style={{ accentColor: "#2dbef3" }} />
                        <span className="text-[11px] font-semibold" style={{ color: isPrimary ? "#ffffff" : "#0d0446" }}>Cidade Principal</span>
                      </label>
                    )}
                    {!isFavorited && (
                      <button onClick={addFavorite} disabled={isPrimary}
                        className="flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold transition-all disabled:opacity-40"
                        style={{ backgroundColor: "rgba(13,4,70,0.08)", color: "#0d0446", border: "1px solid rgba(13,4,70,0.15)" }}
                      >
                        <Star size={12} /> Secundária
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs" style={{ color: "rgba(13,4,70,0.5)" }}>
                      {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: "rgba(13,4,70,0.6)" }}>{getWeatherLabel(weather.current.weatherCode)}</p>
                </div>
                <div className="flex items-center">
                  <WeatherIcon code={weather.current.weatherCode} size={72} />
                </div>
              </div>

              <div className="flex items-start gap-6 mb-6">
                <div className="text-6xl font-bold flex-shrink-0" style={{ color: "#0d0446" }}>{weather.current.temp}°C</div>
                <div className="flex-1 space-y-3 pt-2">
                  {aiLoading ? (
                    <div className="flex items-center gap-2" style={{ color: "rgba(13,4,70,0.4)" }}>
                      <Sparkles size={14} className="animate-pulse" />
                      <span className="text-xs italic">Gerando descrição...</span>
                    </div>
                  ) : aiDescription ? (
                    <div className="flex items-start gap-2">
                      <Sparkles size={14} className="mt-0.5 flex-shrink-0" style={{ color: "#268ffa" }} />
                      <p className="text-sm leading-relaxed" style={{ color: "#0d0446" }}>{aiDescription}</p>
                    </div>
                  ) : null}

                  {!forecastDescription && !forecastLoading && aiDescription && (
                    <button onClick={fetchForecastDescription}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all hover:scale-105"
                      style={{ background: "rgba(13,4,70,0.08)", color: "#0d0446", border: "1px solid rgba(13,4,70,0.15)" }}
                    >
                      <Sparkles size={12} /> Quer que eu te fale como será os próximos 5 dias?
                    </button>
                  )}
                  {forecastLoading && (
                    <div className="flex items-center gap-2" style={{ color: "rgba(13,4,70,0.4)" }}>
                      <Sparkles size={14} className="animate-pulse" />
                      <span className="text-xs italic">Analisando os próximos dias...</span>
                    </div>
                  )}
                  {forecastDescription && (
                    <div className="rounded-xl p-4" style={{ backgroundColor: "rgba(13,4,70,0.06)", border: "1px solid rgba(13,4,70,0.1)" }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-bold" style={{ color: "#0d0446" }}>Veja como fica o tempo nos próximos 5 dias</span>
                        <button onClick={() => setForecastDescription("")}
                          className="text-xs px-2 py-0.5 rounded-full transition-all hover:bg-[#0d0446]/10"
                          style={{ color: "rgba(13,4,70,0.5)" }}
                        >✕</button>
                      </div>
                      <div className="flex items-start gap-2">
                        <Sparkles size={14} className="mt-0.5 flex-shrink-0" style={{ color: "#268ffa" }} />
                        <p className="text-sm leading-relaxed" style={{ color: "#0d0446" }}>{forecastDescription}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard icon={<Thermometer size={18} />} label="Mínima" value={`${weather.current.tempMin}°C`} color="#60a5fa" />
                <StatCard icon={<Thermometer size={18} />} label="Máxima" value={`${weather.current.tempMax}°C`} color="#f97316" />
                <StatCard icon={<Droplets size={18} />} label="Humidade" value={`${weather.current.humidity}%`} color="#2dbef3" />
                <StatCard icon={<CloudRain size={18} />} label="Chuva" value={`${weather.current.rainChance}%`} color="#a78bfa" />
              </div>
            </div>
          </div>

          {/* Forecast 5 days */}
          <div>
            <h4 className="text-lg font-bold mb-4" style={{ color: "#0d0446" }}>Próximos 5 dias</h4>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              {weather.forecast.map((day) => (
                <div key={day.date}
                  className="rounded-xl p-5 text-center space-y-2 transition-all hover:shadow-lg hover:-translate-y-1 group"
                  style={{ backgroundColor: "#ffffff", border: "2px solid rgba(13,4,70,0.06)" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = "#2dbef3"; e.currentTarget.style.boxShadow = "0 8px 25px rgba(45,190,243,0.15)"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(13,4,70,0.06)"; e.currentTarget.style.boxShadow = "none"; }}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider capitalize" style={{ color: "rgba(13,4,70,0.45)" }}>{formatDay(day.date)}</p>
                  <div className="flex justify-center py-1">
                    <WeatherIcon code={day.weatherCode} size={44} forceDay />
                  </div>
                  <p className="text-[11px] font-medium" style={{ color: "rgba(13,4,70,0.5)" }}>{getWeatherLabel(day.weatherCode)}</p>
                  <p className="text-2xl font-bold" style={{ color: "#0d0446" }}>{day.temp}°C</p>
                  <div className="text-[11px] space-y-1.5 pt-1" style={{ color: "rgba(13,4,70,0.5)" }}>
                    <p className="flex items-center justify-center gap-1">
                      <span style={{ color: "#60a5fa" }}>↓{day.tempMin}°</span>
                      <span className="mx-1">/</span>
                      <span style={{ color: "#f97316" }}>↑{day.tempMax}°</span>
                    </p>
                    <p className="flex items-center justify-center gap-1">
                      <Droplets size={11} style={{ color: "#2dbef3" }} />{day.humidity}%
                    </p>
                    <p className="flex items-center justify-center gap-1">
                      <CloudRain size={11} style={{ color: "#a78bfa" }} />{day.rainChance}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <XmlLinkRow label="XML TEMPO" dark xmlContent={(() => {
            if (!weather) return "";
            const iconUrl = (code: number) => `https://www.weatherbit.io/static/img/icons/${weatherCodeToWbIcon(code)}.png`;
            const dayToXml = (d: DayWeather, tag: string) =>
              `  <${tag} date="${d.date}">\n    <cidade>${weather.city}</cidade>\n    <temperatura>${d.temp}Cº</temperatura>\n    <descricao>${getWeatherLabel(d.weatherCode)}</descricao>\n    <icone_url>${iconUrl(d.weatherCode)}</icone_url>\n    <minima>${d.tempMin}Cº</minima>\n    <maxima>${d.tempMax}Cº</maxima>\n    <humidade>${d.humidity}%</humidade>\n    <precipitacao>${d.rainChance}%</precipitacao>\n  </${tag}>`;
            return `<?xml version="1.0" encoding="UTF-8"?>\n<previsao>\n  <cidade>${weather.city}</cidade>\n${dayToXml(weather.current, "atual")}\n${weather.forecast.map((d) => dayToXml(d, "dia")).join("\n")}\n</previsao>`;
          })()} />
        </>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl p-3.5 text-center transition-all hover:shadow-md"
      style={{ backgroundColor: "rgba(255,255,255,0.5)", border: "1px solid rgba(13,4,70,0.08)" }}>
      <div className="flex items-center justify-center gap-1.5 mb-1.5" style={{ color }}>
        {icon}
        <span className="text-[11px] font-medium" style={{ color: "rgba(13,4,70,0.5)" }}>{label}</span>
      </div>
      <p className="text-lg font-bold" style={{ color: "#0d0446" }}>{value}</p>
    </div>
  );
}
