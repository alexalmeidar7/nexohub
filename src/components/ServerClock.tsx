import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudMoon,
  CloudRain, CloudSnow, CloudSun, Moon, Sun, type LucideIcon,
} from "lucide-react";

const CLOCK_DURATION_MS = 120_000;
const WEATHER_DURATION_MS = 20_000;
const CYCLE_MS = CLOCK_DURATION_MS + WEATHER_DURATION_MS;
const WEATHER_REFRESH_MS = 15 * 60_000;
const COLOR = "#002132";

type WeatherReading = { degrees: string; description: string };
const wxCache = new Map<string, { value: WeatherReading | null; updatedAt: number; promise?: Promise<WeatherReading | null> }>();
const validId = (value?: string | null) =>
  !!value && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);

function readWeatherXml(raw: string): WeatherReading | null {
  const doc = new DOMParser().parseFromString(raw, "application/xml");
  if (doc.querySelector("parsererror") || doc.querySelector("disponivel")?.textContent?.trim() === "0") return null;
  const current = doc.querySelector("previsao > atual") || doc.querySelector("atual");
  if (!current) return null;
  const temperature = current.querySelector("temperatura")?.textContent || "";
  const rawDegrees = temperature.match(/-?\d+(?:[.,]\d+)?/)?.[0];
  if (!rawDegrees) return null;
  return {
    degrees: Math.round(Number(rawDegrees.replace(",", "."))) + "°C",
    description: current.querySelector("descricao")?.textContent?.trim() || "Tempo atual",
  };
}

async function fetchStationWeather(stationId: string): Promise<WeatherReading | null> {
  const cached = wxCache.get(stationId);
  const now = Date.now();
  if (cached && now - cached.updatedAt < WEATHER_REFRESH_MS) return cached.value;
  if (cached?.promise) return cached.promise;
  const promise = (async () => {
    try {
      const base = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      if (!base) return null;
      const response = await fetch(
        base + "/functions/v1/serve-xml-tempo?user_id=" + encodeURIComponent(stationId),
        { cache: "no-store", signal: AbortSignal.timeout(10_000) },
      );
      if (!response.ok) return null;
      return readWeatherXml(await response.text());
    } catch (error) {
      console.warn("[HeaderClock] Previsão temporariamente indisponível", error);
      return null;
    }
  })();
  wxCache.set(stationId, { value: cached?.value || null, updatedAt: cached?.updatedAt || 0, promise });
  const current = await promise;
  wxCache.set(stationId, { value: current, updatedAt: Date.now() });
  return current;
}

function weatherIcon(description: string, hour: number): LucideIcon {
  const name = description.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/trovo|raio|tempestad|relamp/.test(name)) return CloudLightning;
  if (/neve|granizo/.test(name)) return CloudSnow;
  if (/neblina|nevo|nevoeiro|fog/.test(name)) return CloudFog;
  if (/garoa|chuvisco/.test(name)) return CloudDrizzle;
  if (/chuva|chuvoso|aguaceiro/.test(name)) return CloudRain;
  const night = hour < 6 || hour >= 18;
  if (/nublado|encoberto|muitas nuvens|nuvens/.test(name)) return Cloud;
  if (/parcial|poucas nuvens|algumas nuvens/.test(name)) return night ? CloudMoon : CloudSun;
  return night ? Moon : Sun;
}

export default function ServerClock({
  timezone,
  stationId,
}: {
  timezone?: string | null;
  stationId?: string | null;
}) {
  const [now, setNow] = useState(() => new Date());
  const [cycleStarted] = useState(() => Date.now());
  const [weather, setWeather] = useState<WeatherReading | null>(null);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    setWeather(null);
    if (!validId(stationId)) return;
    let active = true;
    const load = async () => {
      const reading = await fetchStationWeather(stationId);
      if (active) setWeather(reading);
    };
    void load();
    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, WEATHER_REFRESH_MS);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [stationId]);

  const tz = timezone || undefined;
  let hours: string;
  let seconds: string;
  let hour: number;
  try {
    hours = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(now);
    seconds = new Intl.DateTimeFormat("pt-BR", { timeZone: tz, second: "2-digit" }).format(now).padStart(2, "0");
    hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(now));
  } catch {
    hours = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    seconds = String(now.getSeconds()).padStart(2, "0");
    hour = now.getHours();
  }

  const showWeather = !!weather && (now.getTime() - cycleStarted) % CYCLE_MS >= CLOCK_DURATION_MS;
  const Glyph = weather ? weatherIcon(weather.description, hour) : Sun;
  const motionProps = reducedMotion
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
      initial: { opacity: 0, y: 7, filter: "blur(2px)" },
      animate: { opacity: 1, y: 0, filter: "blur(0px)" },
      exit: { opacity: 0, y: -7, filter: "blur(2px)" },
    };

  return <div
    className="relative flex h-[31px] w-[109px] shrink-0 items-center justify-end overflow-hidden"
    style={{ color: COLOR }}
    title={showWeather ? weather?.description : (tz ? "Fuso: " + tz : "Relógio")}
    aria-live="off"
  >
    <AnimatePresence mode="wait" initial={false}>
      {showWeather ? (
        <motion.span key="weather"
          {...motionProps}
          transition={{ duration: reducedMotion ? 0.1 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="flex w-full items-center justify-end gap-1.5 whitespace-nowrap"
          style={{ fontFamily: "Poppins, sans-serif" }}
        >
          <motion.span
            animate={reducedMotion ? {} : { y: [0, -2, 0], rotate: [0, 3, 0] }}
            transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center"
          ><Glyph size={27} strokeWidth={1.8} aria-hidden="true"/></motion.span>
          <span className="text-[23px] font-light tracking-tight">{weather?.degrees}</span>
        </motion.span>
      ) : (
        <motion.span key="clock"
          {...motionProps}
          transition={{ duration: reducedMotion ? 0.1 : 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex w-full items-start justify-end whitespace-nowrap font-light tracking-wider"
          style={{ fontFamily: "Poppins, sans-serif", fontSize: "24px", lineHeight: 1.1 }}
        >
          {hours}
          <span className="inline-block text-left font-light"
            style={{ fontSize: "11px", width: "18px", marginTop: "2px", opacity: 0.7 }}
          >{seconds}</span>
        </motion.span>
      )}
    </AnimatePresence>
  </div>;
}

export { readWeatherXml, weatherIcon, CLOCK_DURATION_MS, WEATHER_DURATION_MS };
