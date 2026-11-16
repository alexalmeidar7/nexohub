import { useEffect, useMemo, useState } from "react";
import { WeatherIcon } from "@/components/WeatherIcons";
import { supabase } from "@/integrations/supabase/client";

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

  const [weather, setWeather] = useState<{ temp: number; code: number } | null>(null);

  useEffect(() => {
    if (!radioUserId) return;
    let cancelled = false;
    let intervalId: number | undefined;

    const fetchWeather = async (lat?: number | null, lon?: number | null) => {
      try {
        const { data } = await supabase.functions.invoke("fetch-weather", {
          body: { action: "forecast", lat: lat ?? null, lon: lon ?? null, user_id: radioUserId, forecast_days: 1 },
        });
        const c = (data as any)?.data?.current ?? (data as any)?.current;
        if (!cancelled && c && typeof c.temperature_2m === "number") {
          setWeather({ temp: Math.round(c.temperature_2m), code: Number(c.weather_code) || 0 });
        }
      } catch {}
    };

    (async () => {
      let lat: number | null = null;
      let lon: number | null = null;
      try {
        const { data: settings } = await supabase
          .from("user_settings")
          .select("weather_city, weather_lat, weather_lon")
          .eq("user_id", radioUserId)
          .maybeSingle();
        if (typeof (settings as any)?.weather_lat === "number") lat = (settings as any).weather_lat;
        if (typeof (settings as any)?.weather_lon === "number") lon = (settings as any).weather_lon;
        const city = String((settings as any)?.weather_city || "").trim();
        if ((lat == null || lon == null) && city) {
          const { data: geoData } = await supabase.functions.invoke("fetch-weather", {
            body: { action: "geocode", query: city, count: 1 },
          });
          const location = (geoData as any)?.results?.[0];
          if (typeof location?.latitude === "number" && typeof location?.longitude === "number") {
            lat = location.latitude;
            lon = location.longitude;
          }
        }
      } catch {}
      fetchWeather(lat, lon);
      intervalId = window.setInterval(() => fetchWeather(lat, lon), 5 * 60 * 1000);
    })();

    return () => {
      cancelled = true;
      if (intervalId) window.clearInterval(intervalId);
    };
  }, [radioUserId]);

  const clockSize = compact ? 22 : 28;
  const secSize = compact ? 13 : 16;

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      {(weather || compact) && (
        <div
          className={`${compact ? "flex" : "hidden sm:flex"} items-center gap-2`}
          title="Tempo agora"
        >
          <WeatherIcon code={weather?.code ?? 0} size={compact ? 26 : 34} />
          <span className="text-white font-semibold text-[16px] sm:text-[18px] leading-none tabular-nums">
            {weather ? `${weather.temp}°` : "--°"}
          </span>
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
