import { useEffect, useMemo, useRef, useState } from "react";
import { Cloud, CloudLightning, CloudRain, CloudSnow, CloudSun, Minus, Plus, Sun } from "lucide-react";
import { playerSupabase } from "@/integrations/supabase/playerClient";
import { fetchWeatherForecast, searchGeocode } from "@/lib/weatherService";

type ForecastDay = { date: string; min: number; max: number; rain: number; code: number };

function FlatWeatherIcon({ code, size }: { code: number; size: number }) {
  const Icon = code === 0 ? Sun
    : code === 1 || code === 2 ? CloudSun
    : code === 3 || code === 45 || code === 48 ? Cloud
    : code >= 71 && code <= 77 ? CloudSnow
    : code >= 95 ? CloudLightning
    : CloudRain;
  return <Icon size={size} strokeWidth={1.8} className="shrink-0 text-white" aria-hidden="true" />;
}

/**
 * Relógio + previsão do tempo no mesmo padrão visual do /player/watch.
 * Reutilizável em qualquer tela do player.
 */
export default function PlayerClockWeather({
  radioUserId,
  compact = false,
}: {
  radioUserId?: string | null;
  compact?: boolean;
}) {
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const clockTime = useMemo(() => ({
    hh: String(now.getHours()).padStart(2, "0"),
    mm: String(now.getMinutes()).padStart(2, "0"),
    ss: String(now.getSeconds()).padStart(2, "0"),
  }), [now]);

  const [weather, setWeather] = useState<{ temp: number; code: number; forecast: ForecastDay[] } | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState(false);
  const [forecastOpen, setForecastOpen] = useState(false);
  const forecastRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!forecastOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !forecastRef.current?.contains(event.target)) setForecastOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setForecastOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [forecastOpen]);

  useEffect(() => {
    if (!radioUserId) return;
    let cancelled = false;
    let intervalId: number | undefined;

    const fetchWeather = async (lat?: number | null, lon?: number | null) => {
      setWeatherLoading(true);
      try {
        let payload: any;
        if (lat != null && lon != null) {
          const result = await fetchWeatherForecast(lat, lon, 3);
          if (!result.ok || !result.data) throw new Error(result.error || "Previsão sem dados");
          payload = result.data;
        } else {
          // Em sessões públicas, a política de leitura pode bloquear user_settings.
          // A função já resolve a cidade da emissora no servidor usando radioUserId.
          const { data, error } = await playerSupabase.functions.invoke("fetch-weather", {
            body: { action: "forecast", user_id: radioUserId, forecast_days: 3 },
          });
          if (error) throw error;
          const response = data as any;
          payload = [response?.data, response?.data?.data, response].find((candidate) => candidate?.current);
          if (!payload) throw new Error(response?.error || response?.data?.error || "A emissora não retornou dados do tempo");
        }
        const c = payload.current;
        const daily = payload.daily;
        const currentTemperature = Number(c?.temperature_2m);
        if (!cancelled && c && Number.isFinite(currentTemperature)) {
          const forecast: ForecastDay[] = Array.isArray(daily?.time)
            ? daily.time.slice(0, 3).map((date: string, index: number) => ({
                date,
                min: Number(daily.temperature_2m_min?.[index]),
                max: Number(daily.temperature_2m_max?.[index]),
                rain: Number(daily.precipitation_sum?.[index]) || 0,
                code: Number(daily.weather_code?.[index]) || 0,
              })).filter((day: ForecastDay) => Number.isFinite(day.min) && Number.isFinite(day.max))
            : [];
          setWeather({ temp: Math.round(currentTemperature), code: Number(c.weather_code) || 0, forecast });
          setWeatherError(false);
        } else if (!cancelled) {
          console.warn("Previsão do Cidade Tempo sem dados atuais:", payload);
          setWeatherError(true);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn("Não foi possível carregar o tempo atual:", error);
          setWeatherError(true);
        }
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    };

    const onPrimaryCityChanged = (event: Event) => {
      const city = (event as CustomEvent<{ lat?: number; lon?: number } | null>).detail;
      if (city?.lat != null && city?.lon != null && Number.isFinite(Number(city.lat)) && Number.isFinite(Number(city.lon))) {
        fetchWeather(Number(city.lat), Number(city.lon));
      }
    };
    window.addEventListener("weather:primary-city-changed", onPrimaryCityChanged);

    (async () => {
      let lat: number | null = null;
      let lon: number | null = null;
      let city = "";
      try {
        // Usar a mesma ordem de chaves da página Cidade Tempo: dados escopados
        // para a emissora primeiro, seguido do valor principal legado global.
        const rawPrimary = localStorage.getItem(`nexohub_cidade_tempo_primary_${radioUserId}`)
          || localStorage.getItem(`masterview_primary_city_${radioUserId}`)
          || localStorage.getItem("masterview_primary_city");
        const primary = rawPrimary ? JSON.parse(rawPrimary) : null;
        city = String(primary?.name || "").trim();
        if (primary?.lat != null && primary?.lon != null && Number.isFinite(Number(primary.lat)) && Number.isFinite(Number(primary.lon))) {
          lat = Number(primary.lat);
          lon = Number(primary.lon);
        }
        // Cidade Tempo também salva a última cidade consultada mesmo antes de
        // ela ser marcada como principal. Reutilize essa escolha no player.
        if (!city) {
          city = localStorage.getItem(`masterview_last_city_${radioUserId}`)
            || localStorage.getItem("masterview_last_city")
            || "";
        }
      } catch {}
      try {
        const { data: settings } = await playerSupabase
          .from("user_settings")
          .select("weather_city, weather_lat, weather_lon, dashboard_items")
          .eq("user_id", radioUserId)
          .maybeSingle();
        const items = (settings as any)?.dashboard_items || {};
        const primary = items.cidade_tempo_primary;
        city = city || String(primary?.name || (settings as any)?.weather_city || "").trim();
        if (lat == null || lon == null) {
          const savedLat = primary?.lat ?? (settings as any)?.weather_lat;
          const savedLon = primary?.lon ?? (settings as any)?.weather_lon;
          if (savedLat != null && savedLon != null && Number.isFinite(Number(savedLat)) && Number.isFinite(Number(savedLon))) {
            lat = Number(savedLat);
            lon = Number(savedLon);
          }
        }
      } catch {}
      if ((lat == null || lon == null) && city) {
        const locations = await searchGeocode(city, 1);
        if (locations[0]) {
          lat = locations[0].latitude;
          lon = locations[0].longitude;
        }
      }
      fetchWeather(lat, lon);
      intervalId = window.setInterval(() => fetchWeather(lat, lon), 5 * 60 * 1000);
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("weather:primary-city-changed", onPrimaryCityChanged);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [radioUserId]);

  const clockSize = compact ? 22 : 28;
  const secSize = compact ? 13 : 16;

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {(weather || compact) && (
        <div
          className={`${compact ? "flex" : "hidden sm:flex"} relative items-center gap-2 transition-all duration-300 ease-out ${forecastOpen ? "rounded-full bg-white/[0.10] px-3 py-1 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.22),inset_0_1px_0_rgba(255,255,255,0.12)]" : ""}`}
          ref={forecastRef}
        >
          <div
            className="flex shrink-0 items-center gap-2 overflow-hidden whitespace-nowrap transition-all duration-300 ease-out"
            style={{ maxWidth: forecastOpen ? 620 : 0, opacity: forecastOpen ? 1 : 0, transform: forecastOpen ? "translateX(0)" : "translateX(-8px)" }}
            aria-hidden={!forecastOpen}
          >
            {weather?.forecast.slice(0, 3).map((day, index) => (
              <div key={day.date} className="flex shrink-0 items-center gap-2">
                {index > 0 && <span aria-hidden="true" className="text-white/55 text-sm">|</span>}
                <span className="text-[11px] sm:text-xs font-semibold text-white">
                  {index === 0 ? "hoje" : `${day.date.slice(8, 10)}/${day.date.slice(5, 7)}`}
                </span>
                <span className="whitespace-nowrap text-[10px] sm:text-xs text-white/85 tabular-nums">
                  {Math.round(day.min)}°/{Math.round(day.max)}°
                </span>
                <span className="whitespace-nowrap text-[9px] sm:text-[10px] text-white/55 tabular-nums" title="Chuva acumulada">
                  {day.rain.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mm
                </span>
                <FlatWeatherIcon code={day.code} size={13} />
              </div>
            ))}
            {forecastOpen && !weather?.forecast.length && (
              <span className="shrink-0 text-[10px] text-white/65">
                {weatherLoading ? "carregando previsão…" : weatherError ? "previsão indisponível" : "sem previsão disponível"}
              </span>
            )}
          </div>
          {forecastOpen && <span aria-hidden="true" className="text-white/55 text-sm">|</span>}
          <div className="flex shrink-0 items-center gap-2" title="Tempo agora" aria-busy={!weather}>
            <FlatWeatherIcon code={weather?.code ?? 0} size={compact ? 18 : 22} />
            <span
              className="text-white font-light leading-none tabular-nums"
              style={{ fontFamily: '"Sora", system-ui, sans-serif', fontSize: clockSize, fontVariantNumeric: "tabular-nums" }}
            >
              {weather ? `${weather.temp}°` : "--°"}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setForecastOpen((open) => !open)}
            aria-label={forecastOpen ? "Fechar previsão do tempo" : "Abrir previsão do tempo para os próximos dias"}
            aria-expanded={forecastOpen}
            className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-white/35 bg-white/[0.10] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.18),0_3px_10px_rgba(0,0,0,0.16)] backdrop-blur-xl transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/70"
          >
            {forecastOpen ? <Minus size={13} strokeWidth={2} /> : <Plus size={13} strokeWidth={2} />}
          </button>
        </div>
      )}

      {(weather || compact) && <span aria-hidden="true" className="text-white/70 text-lg leading-none">|</span>}

      <div
        className="flex items-baseline gap-1"
        aria-label="Horário atual"
      >
        <span
          className="text-white font-light tabular-nums tracking-[0.02em] leading-none"
          style={{ fontFamily: '"Sora", system-ui, sans-serif', fontSize: clockSize, fontVariantNumeric: "tabular-nums", width: "5ch", textAlign: "center" }}
        >
          {clockTime.hh}
          <span className="opacity-60 mx-[2px]">:</span>
          {clockTime.mm}
        </span>
        {!compact && <span
          className="text-white/60 font-light tabular-nums leading-none"
          style={{ fontFamily: '"Sora", system-ui, sans-serif', fontSize: secSize }}
        >
          {clockTime.ss}
        </span>}
      </div>
    </div>
  );
}
