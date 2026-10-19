import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Search, Droplets, CloudRain, Thermometer, Star, Sparkles, MapPin, Wind, Loader2, Plus, X } from "lucide-react";
import { WeatherIcon } from "./WeatherIcons";
import { supabase } from "@/integrations/supabase/client";
import ModulePageSkeleton from "./skeletons/ModulePageSkeleton";
import { useAuth } from "@/hooks/useAuth";
import { useUserSlug } from "@/hooks/useUserSlug";
import { confirmDialog } from "@/lib/confirmDialog";
import { findClientAccountById, findClientAccountByEmail } from "@/lib/clientAuthAccounts";
import { mergeUserDashboardItems } from "@/lib/userSettings";
import { toast } from "sonner";
import { searchGeocode, fetchWeatherForecast, type GeoResult } from "@/lib/weatherService";

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

const REFRESH_INTERVAL = 5 * 60 * 1000;

// Palette (nexo-form-design-system - ClientesPage style)
const CYAN = "#0055ff";
const LIME = "#0055ff";
const CARD_BG = "#ffffff";
const DARK = "#002132";

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

export interface PrevisaoTempoProps {
  effectiveUserId?: string | null;
}

function getLookupKeys(ownerId: string | null, altUid: string | null, slug: string | null, email: string | null): string[] {
  return Array.from(new Set([ownerId, altUid, slug, email].filter(Boolean) as string[]));
}

function getFavoritesFromStorage(keys: string[]): FavoriteCity[] {
  for (const k of keys) {
    try {
      const raw = localStorage.getItem(`nexohub_cidade_tempo_favorites_${k}`) || localStorage.getItem(`masterview_favorite_cities_${k}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
  }
  try {
    const raw = localStorage.getItem("masterview_favorite_cities");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  return [];
}

function saveFavoritesToStorage(keys: string[], list: FavoriteCity[], ownerId: string | null) {
  const json = JSON.stringify(list);
  for (const k of keys) {
    try {
      localStorage.setItem(`nexohub_cidade_tempo_favorites_${k}`, json);
      localStorage.setItem(`masterview_favorite_cities_${k}`, json);
    } catch {}
  }
  try {
    localStorage.setItem("masterview_favorite_cities", json);
  } catch {}

  // Sync asynchronously to database dashboard_items
  if (ownerId) {
    mergeUserDashboardItems(ownerId, { cidade_tempo_favorites: list }).catch(() => {});
  }
}

function getPrimaryCityFromStorage(keys: string[]): PrimaryCity | null {
  for (const k of keys) {
    try {
      const raw = localStorage.getItem(`nexohub_cidade_tempo_primary_${k}`) || localStorage.getItem(`masterview_primary_city_${k}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed.name === "string" && parsed.lat != null && parsed.lon != null) {
          return parsed;
        }
      }
    } catch {}
  }
  try {
    const raw = localStorage.getItem("masterview_primary_city");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.name === "string" && parsed.lat != null && parsed.lon != null) {
        return parsed;
      }
    }
  } catch {}
  return null;
}

function savePrimaryCityToStorage(keys: string[], city: PrimaryCity | null, ownerId: string | null) {
  const json = city ? JSON.stringify(city) : null;
  for (const k of keys) {
    try {
      if (city && json) {
        localStorage.setItem(`nexohub_cidade_tempo_primary_${k}`, json);
        localStorage.setItem(`masterview_primary_city_${k}`, json);
        localStorage.setItem(`masterview_last_city_${k}`, city.name);
      } else {
        localStorage.removeItem(`nexohub_cidade_tempo_primary_${k}`);
        localStorage.removeItem(`masterview_primary_city_${k}`);
      }
    } catch {}
  }
  try {
    if (city && json) {
      localStorage.setItem("masterview_primary_city", json);
      localStorage.setItem("masterview_last_city", city.name);
    } else {
      localStorage.removeItem("masterview_primary_city");
    }
  } catch {}

  // Notify widgets and dashboard in realtime
  try {
    window.dispatchEvent(new CustomEvent("weather:primary-city-changed", { detail: city }));
  } catch {}

  // Sync to database
  if (ownerId) {
    const nowIso = new Date().toISOString();
    supabase
      .from("user_settings")
      .update({
        weather_city: city?.name || null,
        weather_lat: city?.lat ?? null,
        weather_lon: city?.lon ?? null,
        updated_at: nowIso,
      })
      .eq("user_id", ownerId)
      .then(() => {}, () => {});

    mergeUserDashboardItems(ownerId, {
      cidade_tempo_primary: city,
      weather_city: city?.name || null,
      weather_lat: city?.lat ?? null,
      weather_lon: city?.lon ?? null,
    }).catch(() => {});
  }
}

export default function PrevisaoTempo({ effectiveUserId }: PrevisaoTempoProps = {}) {
  const { user } = useAuth();
  const rawUid = effectiveUserId || user?.id || null;
  const clientAcc = findClientAccountById(rawUid) || findClientAccountByEmail(user?.email || rawUid);
  const ownerId = clientAcc?.parentUserId || clientAcc?.id || rawUid;
  const stationSlug = clientAcc?.slug || null;
  const stationEmail = clientAcc?.email || user?.email || null;
  const stationDefaultCity = clientAcc?.cidade || null;
  const lookupKeys = useMemo(
    () => getLookupKeys(ownerId, user?.id || null, stationSlug, stationEmail),
    [ownerId, user?.id, stationSlug, stationEmail]
  );
  const lookupKeysRef = useRef(lookupKeys);
  lookupKeysRef.current = lookupKeys;

  const hookSlug = useUserSlug(ownerId || undefined);
  const resolvedSlug = stationSlug || hookSlug || "p";

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
    const clean = query.trim();
    if (clean.length < 2) { setSuggestions([]); return; }
    try {
      const results = await searchGeocode(clean, 5);
      setSuggestions(results || []);
      setShowSuggestions((results || []).length > 0);
    } catch {
      setSuggestions([]);
    }
  }, []);

  const handleCityChange = (value: string) => {
    setCity(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 300);
  };

  const selectSuggestion = (geo: GeoResult) => {
    const displayName = geo.name;
    setCity(displayName);
    setShowSuggestions(false);
    setSuggestions([]);
    fetchWeatherByCoords(geo.latitude, geo.longitude, displayName);
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
      const resp = await fetchWeatherForecast(lat, lon, 6);
      if (!resp.ok || !resp.data) {
        throw new Error(resp.error || "Erro ao obter previsão");
      }
      const wxData = resp.data;
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
      const isNight = wxData.current?.is_day === 0;
      lookupKeysRef.current.forEach(k => {
        try { localStorage.setItem(`masterview_last_city_${k}`, name); } catch {}
      });
      try { localStorage.setItem("masterview_last_city", name); } catch {}
      setWeather({ city: name, lat, lon, current, forecast, isNight });
      setError("");
    } catch {
      if (!silent) setError("Erro ao buscar dados meteorológicos.");
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWeather = useCallback(async (searchCity: string, silent = false) => {
    const query = searchCity.trim();
    if (!query) return;
    if (!silent) { setLoading(true); setError(""); setWeather(null); }
    try {
      const results = await searchGeocode(query, 5);
      if (!results || results.length === 0) {
        if (!silent) {
          setError(`Cidade "${query}" não encontrada.`);
          setLoading(false);
        }
        return;
      }
      const top = results[0];
      await fetchWeatherByCoords(top.latitude, top.longitude, top.name, silent);
    } catch {
      if (!silent) {
        setError("Erro ao buscar dados meteorológicos.");
        setLoading(false);
      }
    }
  }, [fetchWeatherByCoords]);

  const searchWeather = () => { setShowSuggestions(false); fetchWeather(city); };

  useEffect(() => {
    if (!ownerId) {
      setCity("");
      setWeather(null);
      setFavorites([]);
      setPrimaryCity(null);
      return;
    }

    // Hydrate per-user state from storage first
    setFavorites(getFavoritesFromStorage(lookupKeys));
    const scopedPrimary = getPrimaryCityFromStorage(lookupKeys);
    setPrimaryCity(scopedPrimary);

    let isMounted = true;

    const loadCity = async () => {
      // 1) If already cached locally in storage
      if (scopedPrimary) {
        if (isMounted) setCity(scopedPrimary.name);
        fetchWeatherByCoords(scopedPrimary.lat, scopedPrimary.lon, scopedPrimary.name);
        return;
      }

      // 2) Check database for saved city (user_settings / dashboard_items)
      try {
        const { data: settings } = await supabase
          .from("user_settings")
          .select("weather_city, weather_lat, weather_lon, dashboard_items")
          .eq("user_id", ownerId)
          .maybeSingle();

        if (settings && isMounted) {
          const items = (settings.dashboard_items || {}) as Record<string, any>;
          if (Array.isArray(items.cidade_tempo_favorites) && items.cidade_tempo_favorites.length > 0) {
            setFavorites(items.cidade_tempo_favorites);
            saveFavoritesToStorage(lookupKeys, items.cidade_tempo_favorites, ownerId);
          }
          if (items.cidade_tempo_primary?.name && items.cidade_tempo_primary?.lat != null) {
            const pc: PrimaryCity = items.cidade_tempo_primary;
            setPrimaryCity(pc);
            setCity(pc.name);
            savePrimaryCityToStorage(lookupKeys, pc, ownerId);
            fetchWeatherByCoords(pc.lat, pc.lon, pc.name);
            return;
          }
          if (settings.weather_city && settings.weather_lat != null && settings.weather_lon != null) {
            const pc: PrimaryCity = {
              name: settings.weather_city,
              lat: settings.weather_lat,
              lon: settings.weather_lon,
            };
            setPrimaryCity(pc);
            setCity(pc.name);
            savePrimaryCityToStorage(lookupKeys, pc, ownerId);
            fetchWeatherByCoords(pc.lat, pc.lon, pc.name);
            return;
          }
        }
      } catch (err) {
        console.warn("[PrevisaoTempo] Erro ao ler user_settings:", err);
      }

      // 3) Check public weather XML for this station
      try {
        const xmlRes = await fetch(`/storage/v1/object/public/xml-files/weather-${ownerId}.xml`);
        if (xmlRes.ok) {
          const xmlText = await xmlRes.text();
          const match = xmlText.match(/<cidade>(.*?)<\/cidade>/);
          if (match?.[1] && isMounted) {
            const cityName = match[1].trim();
            setCity(cityName);
            await fetchWeather(cityName);
            return;
          }
        }
      } catch {}

      // 4) Station default city fallback (e.g. "Goiânia" for Interativa FM / Positiva FM)
      const stationCity = (stationDefaultCity || "Goiânia").split("-")[0].trim();
      if (stationCity && isMounted) {
        setCity(stationCity);
        await fetchWeather(stationCity);
        return;
      }

      // 5) Last search fallback across lookup keys
      for (const k of lookupKeys) {
        const saved = localStorage.getItem(`masterview_last_city_${k}`);
        if (saved && isMounted) {
          setCity(saved);
          await fetchWeather(saved);
          return;
        }
      }
      const globalSaved = localStorage.getItem("masterview_last_city");
      if (globalSaved && isMounted) {
        setCity(globalSaved);
        await fetchWeather(globalSaved);
      }
    };

    loadCity();
    return () => {
      isMounted = false;
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [ownerId, stationDefaultCity, fetchWeather, fetchWeatherByCoords]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (weather && ownerId) {
      intervalRef.current = setInterval(() => {
        let savedCity: string | null = null;
        for (const k of lookupKeysRef.current) {
          const s = localStorage.getItem(`masterview_last_city_${k}`);
          if (s) { savedCity = s; break; }
        }
        if (!savedCity) savedCity = localStorage.getItem("masterview_last_city");
        if (savedCity) fetchWeather(savedCity, true);
      }, REFRESH_INTERVAL);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [weather?.city, ownerId, fetchWeather]);

  const addFavorite = () => {
    if (!weather || !ownerId) return;
    if (favorites.some(f => f.name === weather.city)) return;
    const updated = [...favorites, { name: weather.city, lat: weather.lat, lon: weather.lon, inXml: false }];
    saveFavoritesToStorage(lookupKeys, updated, ownerId);
    setFavorites(updated);
    toast.success(`Cidade "${weather.city}" salva como secundária com sucesso!`);
  };

  const toggleFavoriteXml = (name: string) => {
    if (!ownerId) return;
    const updated = favorites.map(f => f.name === name ? { ...f, inXml: !f.inXml } : f);
    saveFavoritesToStorage(lookupKeys, updated, ownerId);
    setFavorites(updated);
    const item = updated.find(f => f.name === name);
    if (item?.inXml) {
      toast.info(`Cidade "${name}" incluída no XML da emissora.`);
    } else {
      toast.info(`Cidade "${name}" removida do XML.`);
    }
  };

  const removeFavorite = (name: string) => {
    if (!ownerId) return;
    const updated = favorites.filter(f => f.name !== name);
    saveFavoritesToStorage(lookupKeys, updated, ownerId);
    setFavorites(updated);
    toast.success(`Cidade "${name}" removida dos favoritos.`);
  };

  const isFavorited = weather ? favorites.some(f => f.name === weather.city) : false;
  const isPrimary = weather ? primaryCity?.name === weather.city : false;

  const setAsPrimaryCity = async () => {
    if (!weather || !ownerId) return;
    const pc: PrimaryCity = { name: weather.city, lat: weather.lat, lon: weather.lon };
    savePrimaryCityToStorage(lookupKeys, pc, ownerId);
    setPrimaryCity(pc);

    // Remove from favorites if it was there — a city is either primary or secondary.
    if (favorites.some(f => f.name === pc.name)) {
      const updated = favorites.filter(f => f.name !== pc.name);
      saveFavoritesToStorage(lookupKeys, updated, ownerId);
      setFavorites(updated);
    }

    toast.success(`Cidade "${pc.name}" definida como principal e salva com sucesso!`);
  };

  const clearPrimaryCity = async () => {
    if (!ownerId) return;
    savePrimaryCityToStorage(lookupKeys, null, ownerId);
    setPrimaryCity(null);
    toast.info("Cidade principal removida.");
  };

  const togglePrimaryCity = async () => {
    if (isPrimary) await clearPrimaryCity();
    else await setAsPrimaryCity();
  };

  const setFavoriteAsPrimary = async (f: FavoriteCity) => {
    if (!ownerId) return;
    const pc: PrimaryCity = { name: f.name, lat: f.lat, lon: f.lon };
    savePrimaryCityToStorage(lookupKeys, pc, ownerId);
    setPrimaryCity(pc);
    const updated = favorites.filter(fav => fav.name !== f.name);
    if (primaryCity && primaryCity.name !== f.name) {
      updated.unshift({ name: primaryCity.name, lat: primaryCity.lat, lon: primaryCity.lon, inXml: true });
    }
    saveFavoritesToStorage(lookupKeys, updated, ownerId);
    setFavorites(updated);
    fetchWeatherByCoords(f.lat, f.lon, f.name);
    toast.success(`"${f.name}" agora é a Cidade Principal!`);
  };

  const fetchForecastDescription = async () => {
    // AI disabled
    return;
  };

  const today = new Date().toLocaleDateString("pt-BR");

  return (
    <div className="animate-fade-in space-y-8 w-full max-w-none mx-0" style={{ fontFamily: "'Montserrat', sans-serif" }}>
      {/* Header handled by Dashboard Portal */}
      <div id="module-header-title" style={{ display: "none" }}>
        Cidade / Tempo
      </div>

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
          <div className="text-[11px] font-bold text-slate-600 bg-slate-100/90 px-4 py-2 rounded-full uppercase tracking-wider border border-slate-200/80 shadow-xs flex items-center gap-1.5">
            <span className="text-slate-400 font-semibold">Data:</span>
            <span className="text-[#0055ff] font-black">{today}</span>
          </div>
        </div>

        {/* Search field pill */}
        <div className="relative" ref={suggestionsRef}>
          <label style={labelStyle}>Buscar cidade</label>
          <div style={{ display: "flex", gap: 10 }}>
            <div className="relative flex-1">
              <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#0055ff] pointer-events-none z-10" />
              <input
                value={city}
                onChange={(e) => handleCityChange(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchWeather()}
                onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
                placeholder="Digite o nome da cidade..."
                className="w-full h-11 rounded-full bg-[#f8fafc] border border-slate-200/90 pl-11 pr-5 text-xs font-semibold text-slate-800 placeholder:text-slate-400 focus:outline-none focus:border-[#0055ff] focus:ring-1 focus:ring-[#0055ff] transition-all shadow-xs"
                style={{ fontFamily: "'Montserrat', sans-serif" }}
              />
            </div>
            <button
              type="button"
              onClick={searchWeather}
              disabled={loading}
              className="h-11 px-6 rounded-full bg-[#0055ff] hover:bg-[#0047d4] text-white font-extrabold text-xs uppercase tracking-wider inline-flex items-center gap-2 transition-all shadow-md shadow-blue-500/20 active:scale-95 disabled:opacity-60 cursor-pointer shrink-0"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Buscar
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
                border: "1px solid rgba(226, 232, 240, 0.9)",
                boxShadow: "0 10px 30px rgba(0, 0, 0, 0.1)",
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
            <div className="flex gap-2.5 flex-wrap items-center">
              {primaryCity && (
                <div className="inline-flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full bg-amber-50/90 border border-amber-300/80 text-amber-950 shadow-xs transition-all select-none">
                  <button
                    type="button"
                    onClick={() => { setCity(primaryCity.name); fetchWeatherByCoords(primaryCity.lat, primaryCity.lon, primaryCity.name); }}
                    className="inline-flex items-center gap-2 bg-transparent border-none cursor-pointer text-left group"
                    title="Clique para ver a previsão desta cidade"
                  >
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-amber-500 text-white px-2 py-0.5 rounded-full shadow-xs">
                      <Star size={10} className="fill-white" /> Principal
                    </span>
                    <span className="font-black text-xs text-slate-800 group-hover:text-[#0055ff] transition-colors uppercase tracking-wide">
                      {primaryCity.name}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const confirmed = await confirmDialog({
                        title: "Remover Cidade Principal",
                        message: `Remover "${primaryCity.name}" como cidade principal?`,
                        confirmLabel: "Remover",
                        destructive: true,
                      });
                      if (confirmed) clearPrimaryCity();
                    }}
                    className="w-5 h-5 rounded-full bg-amber-200/60 hover:bg-rose-100 hover:text-rose-600 text-amber-800 flex items-center justify-center transition-colors cursor-pointer text-xs"
                    title="Remover cidade principal"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}
              {favorites.map(f => (
                <div
                  key={f.name}
                  className="inline-flex items-center gap-2 pl-2.5 pr-2 py-1.5 rounded-full bg-white hover:bg-slate-50 border border-slate-200/90 text-slate-700 shadow-xs transition-all"
                >
                  <button
                    type="button"
                    onClick={() => setFavoriteAsPrimary(f)}
                    className="text-slate-300 hover:text-amber-500 transition-colors p-1 cursor-pointer rounded-full hover:bg-amber-50"
                    title="Tornar esta cidade a Principal"
                  >
                    <Star size={13} />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCity(f.name); fetchWeather(f.name); }}
                    className="bg-transparent border-none cursor-pointer font-bold text-xs text-slate-700 hover:text-[#0055ff] transition-colors uppercase tracking-wide text-left"
                    title="Clique para ver a previsão"
                  >
                    {f.name}
                  </button>
                  <label
                    className="inline-flex items-center gap-1.5 cursor-pointer select-none text-[10px] font-bold text-slate-500 bg-slate-100 hover:bg-blue-50 hover:text-[#0055ff] px-2 py-0.5 rounded-full transition-colors"
                    title="Incluir no XML da rádio"
                  >
                    <input
                      type="checkbox"
                      checked={f.inXml}
                      onChange={() => toggleFavoriteXml(f.name)}
                      className="rounded text-[#0055ff] focus:ring-0 w-3 h-3 cursor-pointer"
                    />
                    <span>XML</span>
                  </label>
                  <button
                    type="button"
                    onClick={async () => {
                      const confirmed = await confirmDialog({
                        title: "Remover Favorito",
                        message: `Remover "${f.name}" dos favoritos?`,
                        confirmLabel: "Remover",
                        destructive: true,
                      });
                      if (confirmed) removeFavorite(f.name);
                    }}
                    className="w-5 h-5 rounded-full hover:bg-rose-50 hover:text-rose-600 text-slate-400 flex items-center justify-center transition-colors cursor-pointer text-xs"
                    title="Remover"
                  >
                    <X size={12} />
                  </button>
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
                    <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-amber-50 border border-amber-300/80 text-amber-900 text-[11px] font-black uppercase tracking-wider shadow-xs">
                      <Star size={12} className="fill-amber-500 text-amber-500" /> Cidade Principal
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={setAsPrimaryCity}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white hover:bg-amber-50/80 border border-slate-200/90 hover:border-amber-300 text-slate-700 hover:text-amber-800 text-[11px] font-bold uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95"
                    >
                      <Star size={12} className="text-amber-500" />
                      {primaryCity ? "Tornar Principal" : "Definir como Principal"}
                    </button>
                  )}
                  {!isFavorited && !isPrimary && (
                    <button
                      type="button"
                      onClick={addFavorite}
                      className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-blue-50 border border-slate-200/60 hover:border-[#0055ff]/30 text-slate-700 hover:text-[#0055ff] text-[11px] font-bold uppercase tracking-wider transition-all shadow-xs cursor-pointer active:scale-95"
                    >
                      <Plus size={12} /> Salvar como Secundária
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
