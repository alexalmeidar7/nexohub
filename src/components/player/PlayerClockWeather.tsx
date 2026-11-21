import { useEffect, useMemo, useState } from "react";
import { Cloud, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun, Moon } from "lucide-react";
import { playerSupabase } from "@/integrations/supabase/playerClient";

const CITY_KEY = "nexo_tv_manual_city";

function FlatWeatherIcon({ code, size }: { code: number; size: number }) {
  const hours = new Date().getHours();
  const useNightIcon = hours < 6 || hours >= 18;
  if (code === 0 && useNightIcon) {
    return <Moon size={size} strokeWidth={1.8} className="shrink-0 text-white" aria-hidden="true" />;
  }
  const Icon = code === 0 ? Sun
    : code === 1 || code === 2 ? CloudSun
    : code === 3 || code === 45 || code === 48 ? Cloud
    : code >= 71 && code <= 77 ? CloudSnow
    : code >= 95 ? CloudLightning
    : CloudRain;
  return <Icon size={size} strokeWidth={1.8} className="shrink-0 text-white" aria-hidden="true" />;
}

type Coordinates = { lat: number; lon: number };
type Weather = { temp: number; code: number };

export default function PlayerClockWeather({
  radioUserId,
  compact = false,
  tvHeader = false,
  weekPanel = false,
}: {
  radioUserId?: string | null;
  compact?: boolean;
  tvHeader?: boolean;
  weekPanel?: boolean;
}) {
  const [now, setNow] = useState<Date>(() => new Date());
  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [cityQuery, setCityQuery] = useState("");
  const [cityResults, setCityResults] = useState<Array<{ name: string; display_name: string; latitude: number; longitude: number }>>([]);
  const [cityError, setCityError] = useState("");
  const [manualLocation, setManualLocation] = useState<Coordinates | null>(() => {
    try {
      const saved = localStorage.getItem(CITY_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      return typeof parsed.lat === "number" && typeof parsed.lon === "number" ? parsed : null;
    } catch { return null; }
  });

  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);

  const clockTime = useMemo(() => ({
    hh: String(now.getHours()).padStart(2, "0"),
    mm: String(now.getMinutes()).padStart(2, "0"),
  }), [now]);

  useEffect(() => {
    if (!radioUserId) return;
    let cancelled = false;
    const loadWeather = async () => {
      if (!cancelled) setWeatherLoading(true);
      try {
        let coords: Coordinates | null = manualLocation;
        // A escolha manual tem precedência para respeitar a preferência salva.
        if (!coords && "geolocation" in navigator) {
          try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
              navigator.geolocation.getCurrentPosition(resolve, reject, {
                timeout: 5000, maximumAge: 300000, enableHighAccuracy: false,
              });
            });
            coords = { lat: position.coords.latitude, lon: position.coords.longitude };
          } catch {
            // Sem permissão ou sem localização: usar a cidade da rádio.
          }
        }

        const body = coords
          ? { action: "forecast", lat: coords.lat, lon: coords.lon, forecast_days: 1 }
          : { action: "forecast", user_id: radioUserId, forecast_days: 1 };
        const { data, error } = await playerSupabase.functions.invoke("fetch-weather", { body });
        if (error || !data?.ok) throw error || new Error(data?.error || "Resposta inválida");
        const current = data?.data?.current;
        if (typeof current?.temperature_2m !== "number") throw new Error("Temperatura ausente");
        if (!cancelled) setWeather({
          temp: Math.round(current.temperature_2m),
          code: typeof current.weather_code === "number" ? current.weather_code : 0,
        });
      } catch (error) {
        console.warn("Não foi possível carregar temperatura atual", error);
        if (!cancelled) setWeather(null);
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    };
    void loadWeather();
    const intervalId = window.setInterval(() => { void loadWeather(); }, 300000);
    return () => { cancelled = true; window.clearInterval(intervalId); };
  }, [radioUserId, manualLocation]);

  const searchCities = async () => {
    setCityError("");
    setCityResults([]);
    if (cityQuery.trim().length < 2) {
      setCityError("Digite pelo menos duas letras.");
      return;
    }
    try {
      const { data, error } = await playerSupabase.functions.invoke("fetch-weather", {
        body: { action: "geocode", query: cityQuery.trim(), count: 5 },
      });
      if (error) throw error;
      const results = (data?.results || []).filter((r: any) =>
        typeof r.latitude === "number" && typeof r.longitude === "number");
      setCityResults(results);
      if (!results.length) setCityError("Nenhuma cidade encontrada.");
    } catch {
      setCityError("Não foi possível buscar cidades.");
    }
  };

  const chooseCity = (city: { latitude: number; longitude: number }) => {
    const coords = { lat: city.latitude, lon: city.longitude };
    try { localStorage.setItem(CITY_KEY, JSON.stringify(coords)); } catch { /* armazenamento indisponível */ }
    setManualLocation(coords);
    setCityPickerOpen(false);
  };

  const resetCity = () => {
    try { localStorage.removeItem(CITY_KEY); } catch { /* armazenamento indisponível */ }
    setManualLocation(null);
    setCityPickerOpen(false);
  };

  const clockSize = compact ? "calc(20 * var(--ott-u))" : "calc(28 * var(--ott-u))";
  return (
    <div className="flex items-center gap-2" aria-describedby="player-clock-weather" style={{ fontSize: "calc(20 * var(--ott-u))" }}>
      <div className="flex items-baseline" aria-label="Horário atual">
        <span className="text-white font-light tabular-nums tracking-[0.02em] leading-none"
          style={{ fontFamily: '"Sora", system-ui, sans-serif', fontSize: clockSize, fontVariantNumeric: "tabular-nums", letterSpacing: "0.02em" }}>
          {clockTime.hh}:{clockTime.mm}
        </span>
      </div>
      <span aria-hidden="true" className="text-white/40 text-lg leading-none">|</span>
      <div className="relative flex shrink-0 items-center gap-1.5" title="Tempo agora" aria-busy={weatherLoading}>
        <FlatWeatherIcon code={weather?.code ?? 0} size={compact ? 18 : 22} />
        <button type="button" onClick={() => setCityPickerOpen(v => !v)}
          aria-label="Escolher cidade para previsão do tempo"
          className="text-white font-light leading-none tabular-nums"
          style={{ fontFamily: '"Sora", system-ui, sans-serif', fontSize: clockSize, fontVariantNumeric: "tabular-nums", minWidth: "3ch" }}>
          {weather ? `${weather.temp}°` : "--°"}
        </button>
        {cityPickerOpen && (
          <div className="absolute right-0 top-full z-50 mt-2 w-72 rounded bg-slate-900 p-3 text-sm text-white shadow-lg"
            role="dialog" aria-label="Escolher cidade do clima">
            <label htmlFor="nexo-weather-city" className="mb-2 block">Cidade do clima</label>
            <input id="nexo-weather-city" value={cityQuery} onChange={e => setCityQuery(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") void searchCities(); }}
              placeholder="Digite sua cidade" className="w-full rounded bg-white p-2 text-black" />
            <button type="button" onClick={() => void searchCities()} className="mt-2 rounded bg-blue-600 px-3 py-2">Buscar</button>
            {cityError && <p role="status" className="mt-2">{cityError}</p>}
            <div className="mt-2 flex flex-col gap-1">
              {cityResults.map((city, i) => (
                <button key={`${city.latitude}-${city.longitude}-${i}`} type="button"
                  className="rounded p-2 text-left hover:bg-slate-700 focus:bg-slate-700"
                  onClick={() => chooseCity(city)}>{city.display_name || city.name}</button>
              ))}
            </div>
            <button type="button" onClick={resetCity} className="mt-2 underline">Usar localização automática</button>
            <button type="button" onClick={() => setCityPickerOpen(false)} className="ml-3 underline">Fechar</button>
          </div>
        )}
      </div>
    </div>
  );
}
