import { useState, useEffect, useCallback, useRef } from "react";
import { Search, Droplets, CloudRain, Thermometer, Star, Sparkles, MapPin, Wind } from "lucide-react";
import XmlLinkRow from "./XmlLinkRow";
import XmlSection from "./XmlSection";
import { WeatherIcon } from "./WeatherIcons";
import { supabase } from "@/integrations/supabase/client";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { useAuth } from "@/hooks/useAuth";

interface WeatherData {
  city: string;
  lat: number;
  lon: number;
  current: DayWeather;
  forecast: DayWeather[];
  isNight?: boolean;
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

function weatherCodeToWbIcon(code: number, isNight = false): string {
  const suffix = isNight ? "n" : "d";
  const map: Record<number, string> = {
    0: `c01${suffix}`, 1: `c02${suffix}`, 2: `c02${suffix}`, 3: `c04${suffix}`,
    45: `a05${suffix}`, 48: `a05${suffix}`, 51: `d01${suffix}`, 53: `d02${suffix}`, 55: `d03${suffix}`,
    61: `r01${suffix}`, 63: `r02${suffix}`, 65: `r03${suffix}`, 71: `s01${suffix}`, 73: `s02${suffix}`, 75: `s03${suffix}`,
    80: `r04${suffix}`, 81: `r05${suffix}`, 82: `r06${suffix}`, 95: `t01${suffix}`, 96: `t04${suffix}`, 99: `t05${suffix}`,
  };
  const codes = Object.keys(map).map(Number);
  const closest = codes.reduce((prev, curr) => (Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev));
  return map[closest] || `c01${suffix}`;
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

// Per-user storage keys — never mix data between users on the same device.
const lastCityKey = (uid: string) => `masterview_last_city_${uid}`;
const favoritesKey = (uid: string) => `masterview_favorite_cities_${uid}`;
const primaryCityKey = (uid: string) => `masterview_primary_city_${uid}`;
const REFRESH_INTERVAL = 5 * 60 * 1000;

// Palette (nexo-form-design-system)
const CYAN = "#00BFF0";
const LIME = "#C6F03C";
const CARD_BG = "#D6F4FB";
const DARK = "#0A2540";

const pillInput: React.CSSProperties = {
  width: "100%",
  height: 44,
  borderRadius: 999,
  background: "#FFFFFF",
  border: `2px solid ${CYAN}`,
  padding: "0 20px",
  fontFamily: "'Montserrat', sans-serif",
  fontSize: 13,
  color: DARK,
  outline: "none",
};

const labelStyle: React.CSSProperties = {
  fontFamily: "'Montserrat', sans-serif",
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: 1,
  textTransform: "uppercase",
  color: DARK,
  marginBottom: 8,
  display: "block",
};

interface PrimaryCity {
  name: string;
  lat: number;
  lon: number;
}

function getFavorites(uid: string): FavoriteCity[] {
  try { return JSON.parse(localStorage.getItem(favoritesKey(uid)) || "[]"); } catch { return []; }
}
function saveFavorites(uid: string, list: FavoriteCity[]) {
  localStorage.setItem(favoritesKey(uid), JSON.stringify(list));
}
function getPrimaryCity(uid: string): PrimaryCity | null {
  try { return JSON.parse(localStorage.getItem(primaryCityKey(uid)) || "null"); } catch { return null; }
}
function savePrimaryCity(uid: string, city: PrimaryCity | null) {
  if (city) localStorage.setItem(primaryCityKey(uid), JSON.stringify(city));
  else localStorage.removeItem(primaryCityKey(uid));
}

export default function PrevisaoTempo() {
  const { user } = useAuth();
  const uid = user?.id ?? null;
  const [city, setCity] = useState("");
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [favorites, setFavorites] = useState<FavoriteCity[]>([]);

  const [primaryCity, setPrimaryCity] = useState<PrimaryCity | null>(null);
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
      const { data, error } = await supabase.functions.invoke("fetch-weather", {
        body: { action: "geocode", query, count: 5 },
      });
      if (error) throw error;
      setSuggestions(data?.results || []);
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
    if (!silent) { setLoading(true); setError(""); }
    try {
      const { data: resp, error: fnErr } = await supabase.functions.invoke("fetch-weather", {
        body: { action: "forecast", lat, lon, forecast_days: 6 },
      });
      if (fnErr) throw fnErr;
      const wxData = resp?.data;
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
      const isNight = wxData.current?.is_day === 0;
      if (uid) localStorage.setItem(lastCityKey(uid), name);
      setWeather({ city: name, lat, lon, current, forecast, isNight });
      // AI disabled – skip weather description
    } catch { if (!silent) setError("Erro ao buscar dados meteorológicos."); }
    finally { setLoading(false); }
  }, [uid]);

  const fetchWeather = useCallback(async (searchCity: string, silent = false) => {
    if (!searchCity.trim()) return;
    if (!silent) { setLoading(true); setError(""); setWeather(null); }
    try {
      const { data: geoData, error: geoErr } = await supabase.functions.invoke("fetch-weather", {
        body: { action: "geocode", query: searchCity, count: 1 },
      });
      if (geoErr) throw geoErr;
      if (!geoData?.results?.length) { setError("Cidade não encontrada."); setLoading(false); return; }
      const { latitude, longitude, name } = geoData.results[0];
      await fetchWeatherByCoords(latitude, longitude, name, silent);
    } catch { if (!silent) setError("Erro ao buscar dados meteorológicos."); setLoading(false); }
  }, [fetchWeatherByCoords]);

  const searchWeather = () => { setShowSuggestions(false); fetchWeather(city); };

  useEffect(() => {
    if (!uid) {
      // Reset all UI state when logged out or switching users, so we never mix data.
      setCity("");
      setWeather(null);
      setFavorites([]);
      setPrimaryCity(null);
      return;
    }

    // Hydrate per-user state from user-scoped localStorage first.
    setFavorites(getFavorites(uid));
    const scopedPrimary = getPrimaryCity(uid);
    setPrimaryCity(scopedPrimary);

    const loadCity = async () => {
      if (scopedPrimary) {
        setCity(scopedPrimary.name);
        fetchWeatherByCoords(scopedPrimary.lat, scopedPrimary.lon, scopedPrimary.name);
        return;
      }

      // 2) Fallback: check database for saved city (scoped to this user)
      try {
        const { data: settings } = await supabase
          .from("user_settings")
          .select("weather_city, weather_lat, weather_lon")
          .eq("user_id", uid)
          .maybeSingle();
        if (settings?.weather_city && settings?.weather_lat != null && settings?.weather_lon != null) {
          const pc = { name: settings.weather_city, lat: settings.weather_lat, lon: settings.weather_lon };
          savePrimaryCity(uid, pc);
          setPrimaryCity(pc);
          setCity(pc.name);
          localStorage.setItem(lastCityKey(uid), pc.name);
          fetchWeatherByCoords(pc.lat, pc.lon, pc.name);
          return;
        }
      } catch { /* ignore */ }

      // 3) Last fallback: per-user last city name
      const saved = localStorage.getItem(lastCityKey(uid));
      if (saved) {
        setCity(saved);
        fetchWeather(saved);
      }
    };

    loadCity();
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [uid, fetchWeather, fetchWeatherByCoords]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (weather && uid) {
      intervalRef.current = setInterval(() => {
        const saved = localStorage.getItem(lastCityKey(uid));
        if (saved) fetchWeather(saved, true);
      }, REFRESH_INTERVAL);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [weather, fetchWeather, uid]);

  const addFavorite = () => {
    if (!weather || !uid) return;
    if (favorites.some(f => f.name === weather.city)) return;
    const updated = [...favorites, { name: weather.city, lat: weather.lat, lon: weather.lon, inXml: false }];
    saveFavorites(uid, updated);
    setFavorites(updated);
  };

  const toggleFavoriteXml = (name: string) => {
    if (!uid) return;
    const updated = favorites.map(f => f.name === name ? { ...f, inXml: !f.inXml } : f);
    saveFavorites(uid, updated);
    setFavorites(updated);
  };

  const removeFavorite = (name: string) => {
    if (!uid) return;
    const updated = favorites.filter(f => f.name !== name);
    saveFavorites(uid, updated);
    setFavorites(updated);
  };

  const isFavorited = weather ? favorites.some(f => f.name === weather.city) : false;
  const isPrimary = weather ? primaryCity?.name === weather.city : false;

  const setAsPrimaryCity = async () => {
    if (!weather || !uid) return;
    const pc = { name: weather.city, lat: weather.lat, lon: weather.lon };
    savePrimaryCity(uid, pc);
    setPrimaryCity(pc);
    // Remove from favorites if it was there — a city is either primary or secondary.
    if (favorites.some(f => f.name === pc.name)) {
      const updated = favorites.filter(f => f.name !== pc.name);
      saveFavorites(uid, updated);
      setFavorites(updated);
    }
    const row = { user_id: uid, weather_city: pc.name, weather_lat: pc.lat, weather_lon: pc.lon };
    const { data: existing } = await supabase.from("user_settings").select("id").eq("user_id", uid).maybeSingle();
    if (existing) {
      await supabase.from("user_settings").update(row).eq("user_id", uid);
    } else {
      await supabase.from("user_settings").insert(row);
    }
  };

  const clearPrimaryCity = async () => {
    if (!uid) return;
    savePrimaryCity(uid, null);
    setPrimaryCity(null);
    await supabase.from("user_settings").update({
      weather_city: null, weather_lat: null, weather_lon: null,
    }).eq("user_id", uid);
  };

  const togglePrimaryCity = async () => {
    if (isPrimary) await clearPrimaryCity();
    else await setAsPrimaryCity();
  };

  const fetchForecastDescription = async () => {
    // AI disabled
    return;
  };

  const today = new Date().toLocaleDateString("pt-BR");

  return (
    <div className="animate-fade-in space-y-8" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      {/* FORM CARD — Cadastro de Cidade / Tempo */}
      <section
        style={{
          background: CARD_BG,
          borderRadius: 28,
          padding: "28px 32px 32px",
          boxShadow: "0 2px 12px rgba(10, 37, 64, 0.05)",
        }}
      >
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <h3
            style={{
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: 2,
              color: DARK,
              textTransform: "uppercase",
              margin: 0,
            }}
          >
            Cadastro de Cidade / Tempo
          </h3>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: DARK,
              background: "#FFFFFF",
              padding: "6px 16px",
              borderRadius: 999,
              border: `2px solid ${CYAN}`,
              letterSpacing: 1,
              textTransform: "uppercase",
            }}
          >
            Data: <span style={{ color: CYAN }}>{today}</span>
          </div>
        </div>

        {/* Search field pill */}
        <div className="relative" ref={suggestionsRef}>
          <label style={labelStyle}>Buscar cidade</label>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ position: "relative", flex: 1 }}>
              <MapPin size={16} style={{ position: "absolute", left: 18, top: "50%", transform: "translateY(-50%)", color: CYAN }} />
              <input
                value={city}
                onChange={(e) => handleCityChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchWeather()}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder="Digite o nome da cidade..."
                style={{ ...pillInput, paddingLeft: 42 }}
              />
            </div>
            <button
              onClick={searchWeather}
              disabled={loading}
              style={{
                height: 44,
                padding: "0 26px",
                borderRadius: 999,
                background: LIME,
                border: "none",
                color: DARK,
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: 2,
                textTransform: "uppercase",
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                cursor: loading ? "wait" : "pointer",
                opacity: loading ? 0.7 : 1,
                boxShadow: "0 4px 14px rgba(198, 240, 60, 0.35)",
              }}
            >
              <Search size={16} /> Buscar
            </button>
          </div>
          {showSuggestions && suggestions.length > 0 && (
            <div
              style={{
                position: "absolute",
                zIndex: 50,
                top: "100%",
                left: 0,
                right: 120,
                marginTop: 8,
                background: "#FFFFFF",
                borderRadius: 20,
                overflow: "hidden",
                border: `2px solid ${CYAN}`,
                boxShadow: "0 10px 30px rgba(10,37,64,0.15)",
              }}
            >
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  onClick={() => selectSuggestion(s)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    padding: "10px 16px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    fontSize: 12,
                    background: "transparent",
                    border: "none",
                    borderBottom: i < suggestions.length - 1 ? `1px solid ${CARD_BG}` : "none",
                    cursor: "pointer",
                    color: DARK,
                    fontFamily: "'Montserrat', sans-serif",
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                    <MapPin size={12} style={{ color: CYAN }} />
                    {s.name}{s.admin1 ? `, ${s.admin1}` : ""}
                  </span>
                  <span style={{ fontSize: 10, color: "#94A3B8", fontWeight: 700 }}>{s.country}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Favorites chips */}
        {(primaryCity || favorites.length > 0) && (
          <div style={{ marginTop: 20 }}>
            <label style={labelStyle}>Cidades cadastradas</label>
            <div className="flex gap-2 flex-wrap">
              {primaryCity && (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 8px 8px 16px",
                    borderRadius: 999,
                    background: DARK,
                    color: "#FFFFFF",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <button
                    onClick={() => { setCity(primaryCity.name); fetchWeatherByCoords(primaryCity.lat, primaryCity.lon, primaryCity.name); }}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "transparent", border: "none", color: "#FFFFFF", cursor: "pointer", fontWeight: 700 }}
                  >
                    <Star size={12} style={{ color: LIME }} fill={LIME} />
                    {primaryCity.name}
                  </button>
                  <button
                    onClick={() => { if (confirm(`Remover "${primaryCity.name}" como cidade principal?`)) clearPrimaryCity(); }}
                    style={{ width: 22, height: 22, borderRadius: 999, background: "rgba(255,255,255,0.15)", border: "none", color: "#FFFFFF", cursor: "pointer", fontSize: 12 }}
                    title="Remover cidade principal"
                  >✕</button>
                </div>
              )}
              {favorites.map(f => (
                <div
                  key={f.name}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "8px 12px",
                    borderRadius: 999,
                    background: "#FFFFFF",
                    border: `2px solid ${CYAN}`,
                    color: DARK,
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={f.inXml}
                    onChange={() => toggleFavoriteXml(f.name)}
                    style={{ width: 12, height: 12, accentColor: CYAN }}
                    title="Incluir no XML"
                  />
                  <button
                    onClick={() => { setCity(f.name); fetchWeather(f.name); }}
                    style={{ background: "transparent", border: "none", color: DARK, cursor: "pointer", fontWeight: 700, fontSize: 12 }}
                  >{f.name}</button>
                  <button
                    onClick={() => { if (confirm(`Remover "${f.name}" dos favoritos?`)) removeFavorite(f.name); }}
                    style={{ background: "transparent", border: "none", color: "#94A3B8", cursor: "pointer", fontSize: 12 }}
                    title="Remover"
                  >✕</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && (
          <p style={{ marginTop: 16, fontSize: 12, fontWeight: 700, color: "#dc2626" }}>{error}</p>
        )}
      </section>

      {/* Loading skeleton */}
      {loading && <ModulePageSkeleton variant="list" />}

      {weather && (
        <>
          {/* Current weather card */}
          <section
            style={{
              background: "#FFFFFF",
              borderRadius: 28,
              padding: "24px 28px",
              border: `1px solid ${CARD_BG}`,
              boxShadow: "0 2px 12px rgba(10, 37, 64, 0.05)",
            }}
          >
            <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
              <div className="space-y-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <h3 style={{ fontSize: 22, fontWeight: 800, color: DARK, margin: 0 }}>{weather.city}</h3>
                  {isPrimary ? (
                    <span
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "6px 14px", borderRadius: 999,
                        background: DARK, color: "#FFFFFF",
                        fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase",
                      }}
                    >
                      <Star size={11} fill={LIME} style={{ color: LIME }} /> Cidade Principal
                    </span>
                  ) : (
                    <button
                      onClick={setAsPrimaryCity}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "6px 14px", borderRadius: 999,
                        background: "#FFFFFF", color: DARK,
                        border: `2px solid ${CYAN}`,
                        fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase",
                        cursor: "pointer",
                      }}
                    >
                      <Star size={11} style={{ color: CYAN }} />
                      {primaryCity ? "Tornar Principal" : "Definir como Principal"}
                    </button>
                  )}
                  {!isFavorited && !isPrimary && (
                    <button
                      onClick={addFavorite}
                      style={{
                        display: "inline-flex", alignItems: "center", gap: 6,
                        padding: "6px 14px", borderRadius: 999,
                        background: CARD_BG, color: DARK,
                        border: "none",
                        fontSize: 10, fontWeight: 800, letterSpacing: 1, textTransform: "uppercase",
                        cursor: "pointer",
                      }}
                    >
                      <Star size={11} /> Adicionar Secundária
                    </button>
                  )}
                </div>
                <p style={{ fontSize: 11, color: "#64748B", fontWeight: 600, textTransform: "capitalize", margin: 0 }}>
                  {new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
                </p>
                <p style={{ fontSize: 13, color: DARK, fontWeight: 600, margin: 0 }}>{getWeatherLabel(weather.current.weatherCode)}</p>
              </div>
              <WeatherIcon code={weather.current.weatherCode} size={72} />
            </div>

            <div className="flex items-center gap-6 mb-6 flex-wrap">
              <div style={{ fontSize: 60, fontWeight: 800, color: DARK, lineHeight: 1 }}>{weather.current.temp}°C</div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard icon={<Thermometer size={16} />} label="Mínima" value={`${weather.current.tempMin}°C`} color="#60a5fa" />
              <StatCard icon={<Thermometer size={16} />} label="Máxima" value={`${weather.current.tempMax}°C`} color="#f97316" />
              <StatCard icon={<Droplets size={16} />} label="Humidade" value={`${weather.current.humidity}%`} color={CYAN} />
              <StatCard icon={<CloudRain size={16} />} label="Chuva" value={`${weather.current.rainChance}%`} color="#a78bfa" />
            </div>
          </section>

          {/* Forecast 5 days */}
          <section
            style={{
              background: CARD_BG,
              borderRadius: 28,
              padding: "24px 28px",
              boxShadow: "0 2px 12px rgba(10, 37, 64, 0.05)",
            }}
          >
            <h4 style={{ fontSize: 14, fontWeight: 800, letterSpacing: 2, color: DARK, textTransform: "uppercase", margin: "0 0 16px" }}>
              Próximos 5 dias
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
              {weather.forecast.map((day) => (
                <div
                  key={day.date}
                  style={{
                    background: "#FFFFFF",
                    borderRadius: 20,
                    padding: 16,
                    textAlign: "center",
                    border: `2px solid ${CYAN}`,
                  }}
                >
                  <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1, color: CYAN, textTransform: "uppercase", margin: 0 }}>
                    {formatDay(day.date)}
                  </p>
                  <div style={{ display: "flex", justifyContent: "center", padding: "8px 0" }}>
                    <WeatherIcon code={day.weatherCode} size={44} forceDay />
                  </div>
                  <p style={{ fontSize: 10, color: "#64748B", fontWeight: 600, margin: "0 0 4px" }}>{getWeatherLabel(day.weatherCode)}</p>
                  <p style={{ fontSize: 22, fontWeight: 800, color: DARK, margin: "4px 0" }}>{day.temp}°C</p>
                  <div style={{ fontSize: 11, color: "#64748B", display: "flex", flexDirection: "column", gap: 4, paddingTop: 4 }}>
                    <p style={{ margin: 0, display: "flex", justifyContent: "center", gap: 6 }}>
                      <span style={{ color: "#60a5fa", fontWeight: 700 }}>↓{day.tempMin}°</span>
                      <span style={{ color: "#f97316", fontWeight: 700 }}>↑{day.tempMax}°</span>
                    </p>
                    <p style={{ margin: 0, display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 4 }}>
                      <Droplets size={11} style={{ color: CYAN }} />{day.humidity}%
                    </p>
                    <p style={{ margin: 0, display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 4 }}>
                      <CloudRain size={11} style={{ color: "#a78bfa" }} />{day.rainChance}%
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <XmlLinkRow label="XML TEMPO" dark xmlContent={(() => {
            if (!weather) return "";
            const iconUrl = (code: number, night = false) => `https://www.weatherbit.io/static/img/icons/${weatherCodeToWbIcon(code, night)}.png`;
            const dayToXml = (d: DayWeather, tag: string, night = false) =>
              `  <${tag} date="${d.date}">\n    <cidade>${weather.city}</cidade>\n    <temperatura>${d.temp}Cº</temperatura>\n    <descricao>${getWeatherLabel(d.weatherCode)}</descricao>\n    <icone_url>${iconUrl(d.weatherCode, night)}</icone_url>\n    <minima>${d.tempMin}Cº</minima>\n    <maxima>${d.tempMax}Cº</maxima>\n    <humidade>${d.humidity}%</humidade>\n    <precipitacao>${d.rainChance}%</precipitacao>\n  </${tag}>`;
            const tomorrow = weather.forecast[0];
            const amanhaXml = tomorrow
              ? `  <amanha date="${tomorrow.date}">\n    <temperatura_minima>${tomorrow.tempMin}Cº</temperatura_minima>\n    <temperatura_maxima>${tomorrow.tempMax}Cº</temperatura_maxima>\n    <url_imagem_icone>${iconUrl(tomorrow.weatherCode)}</url_imagem_icone>\n    <descricao_tempo>${getWeatherLabel(tomorrow.weatherCode)}</descricao_tempo>\n  </amanha>`
              : "";
            return `<?xml version="1.0" encoding="UTF-8"?>\n<previsao>\n  <cidade>${weather.city}</cidade>\n${dayToXml(weather.current, "atual", !!weather.isNight)}\n${amanhaXml}\n${weather.forecast.map((d) => dayToXml(d, "dia")).join("\n")}\n</previsao>`;
          })()} />
        </>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div
      style={{
        background: CARD_BG,
        borderRadius: 18,
        padding: "12px 14px",
        textAlign: "center",
        fontFamily: "'Montserrat', sans-serif",
      }}
    >
      <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 6, color }}>
        {icon}
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: "#64748B" }}>{label}</span>
      </div>
      <p style={{ fontSize: 18, fontWeight: 800, color: DARK, margin: 0 }}>{value}</p>
    </div>
  );
}
