import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Map as MapIcon, Navigation } from "lucide-react";
import {
  Cloud, CloudRain, Sun, Moon, CloudMoon, Droplets, CloudSnow, CloudLightning, Wind,
  ChevronLeft, ChevronRight, Star, MapPin, Settings, Car,
  TrendingUp, TrendingDown, RefreshCcw, Loader2, DollarSign, Sparkles,
  Minimize2, Maximize2,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DATAS_COMEMORATIVAS } from "@/data/datasComemorativas";

interface Props {
  weatherCity: string | null;
  weatherLat: number | null;
  weatherLon: number | null;
  userId?: string | null;
}

// ------- Shared card style (elegante / clean, combinando com a barra de audiência) -------
const CARD_BG = "linear-gradient(160deg, rgba(15,15,15,0.82) 0%, rgba(0,0,0,0.72) 100%)";
const CARD_BORDER = "1px solid rgba(255,255,255,0.10)";
const CARD_SHADOW = "0 4px 20px rgba(0,0,0,0.35)";
const ACCENT = "#d70d0e";
const TEXT = "#ffffff";
const MUTED = "rgba(255,255,255,0.62)";
const PROMO_ACCENT_A = "var(--promo-btn-a, #1a1a1a)";
const PROMO_ACCENT_B = "var(--promo-btn-b, #d70d0e)";
const PROMO_TEXT = "var(--promo-text, #ffffff)";
const PROMO_BORDER = "var(--promo-border, #ffffff)";
const PROMO_HEADER = "var(--promo-header, #ffffff)";
const PROMO_CARD_BG = `linear-gradient(160deg, color-mix(in srgb, ${PROMO_ACCENT_A} 58%, black) 0%, color-mix(in srgb, ${PROMO_ACCENT_B} 32%, black) 100%)`;
const PROMO_ACCENT_GRADIENT = `linear-gradient(135deg, ${PROMO_ACCENT_A}, ${PROMO_ACCENT_B})`;
const PROMO_MUTED = `color-mix(in srgb, ${PROMO_HEADER} 62%, transparent)`;

const cardStyle: React.CSSProperties = {
  background: PROMO_CARD_BG,
  border: "none",
  boxShadow: "none",
  borderRadius: 14,
  padding: "10px 14px",
  color: PROMO_TEXT,
  height: 148,
  display: "flex",
  flexDirection: "column",
  gap: 6,
  overflow: "hidden",
  position: "relative",
};

const titleStyle: React.CSSProperties = {
  fontSize: 10,
  letterSpacing: 2,
  fontWeight: 800,
  textTransform: "uppercase",
  color: `color-mix(in srgb, ${PROMO_HEADER} 75%, transparent)`,
  fontFamily: "'Montserrat', sans-serif",
  display: "flex",
  alignItems: "center",
  gap: 6,
};

// ------- Collapsed state persistence -------
const LS_COLLAPSED = "promo-info-collapsed-v1";

function useCollapsed(key: string) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem(LS_COLLAPSED);
      const obj = raw ? JSON.parse(raw) : {};
      return !!obj[key];
    } catch {
      return false;
    }
  });

  const toggle = useCallback(() => {
    setCollapsed((v) => {
      const nv = !v;
      try {
        const raw = localStorage.getItem(LS_COLLAPSED);
        const obj = raw ? JSON.parse(raw) : {};
        obj[key] = nv;
        localStorage.setItem(LS_COLLAPSED, JSON.stringify(obj));
      } catch {
        // ignore
      }
      return nv;
    });
  }, [key]);

  return [collapsed, toggle] as const;
}

function CollapseBtn({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-5 h-5 rounded-full flex items-center justify-center transition-all bg-[#00BFF0] text-white shadow-[0_4px_14px_-4px_rgba(0,191,240,0.55)] hover:brightness-110"
      title={collapsed ? "Maximizar" : "Minimizar"}
    >
      {collapsed ? <Maximize2 size={9} /> : <Minimize2 size={9} />}
    </button>
  );
}

function collapsedCardStyle(base: React.CSSProperties): React.CSSProperties {
  return {
    ...base,
    height: "auto",
    minHeight: 40,
    padding: "8px 12px",
    gap: 0,
    alignSelf: "start",
  };
}

// ================= WEATHER =================

function weatherIcon(code: number, isDay = true, size = 26) {
  const c = code;
  const cls = { color: PROMO_TEXT } as React.CSSProperties;
  
  const iconProps = {
    size,
    style: cls,
    className: "animate-pulse-gentle"
  };

  if ((c === 0 || c === 1) && !isDay) return <Moon {...iconProps} style={{ ...cls, color: "#DCE7FF" }} />;
  if (c === 2 && !isDay) return <CloudMoon {...iconProps} style={{ ...cls, color: "#DCE7FF" }} />;
  if (c === 0 || c === 1) return <Sun {...iconProps} style={{ ...cls, color: "#FFD700" }} />;
  if (c <= 3) return <Cloud {...iconProps} />;
  if (c === 45 || c === 48) return <Wind {...iconProps} />;
  if (c >= 51 && c <= 67) return <CloudRain {...iconProps} style={{ ...cls, color: "#00BFF0" }} />;
  if (c >= 71 && c <= 77) return <CloudSnow {...iconProps} />;
  if (c >= 80 && c <= 82) return <CloudRain {...iconProps} style={{ ...cls, color: "#00BFF0" }} />;
  if (c >= 95) return <CloudLightning {...iconProps} style={{ ...cls, color: "#FFD700" }} />;
  return <Cloud {...iconProps} />;
}

function weatherLabel(code: number) {
  if (code === 0) return "Céu limpo";
  if (code <= 2) return "Parcialmente nublado";
  if (code === 3) return "Nublado";
  if (code === 45 || code === 48) return "Neblina";
  if (code <= 55) return "Garoa";
  if (code <= 65) return "Chuva";
  if (code <= 77) return "Neve";
  if (code <= 82) return "Pancadas de chuva";
  if (code >= 95) return "Tempestade";
  return "—";
}

function WeatherBox({ weatherCity, weatherLat, weatherLon, userId }: Props) {
  const isPositiva = userId === "452ebd1e-61a0-42dd-bf80-231a3f426c83" || !weatherCity || weatherCity.toLowerCase().includes("goiânia");
  const effectiveCity = weatherCity || (isPositiva ? "Goiânia" : null);
  const effectiveLat = weatherLat ?? (isPositiva ? -16.6869 : null);
  const effectiveLon = weatherLon ?? (isPositiva ? -49.2648 : null);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [dayIdx, setDayIdx] = useState(0);
  const [metricIdx, setMetricIdx] = useState(0);

  useEffect(() => {
    if (effectiveLat == null || effectiveLon == null) return;
    let cancel = false;

    const fetchIt = async () => {
      setLoading(true);
      let loaded = false;
      try {
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), 3000));
        const supaPromise = supabase.functions.invoke("fetch-weather", {
          body: { action: "forecast", lat: effectiveLat, lon: effectiveLon, forecast_days: 6 },
        });
        const resp: any = await Promise.race([supaPromise, timeoutPromise]).catch(() => null);
        if (!cancel && resp?.data?.ok && resp.data.data) {
          setData(resp.data.data);
          loaded = true;
        }
      } catch {
        // ignore
      }

      if (!loaded && !cancel) {
        try {
          const res = await fetch(
            `https://api.open-meteo.com/v1/forecast?latitude=${effectiveLat}&longitude=${effectiveLon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,is_day&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=6`
          );
          if (res.ok) {
            const json = await res.json();
            if (!cancel && json?.current) {
              setData(json);
            }
          }
        } catch {
          // ignore
        }
      }

      if (!cancel) setLoading(false);
    };

    fetchIt();
    const iv = setInterval(fetchIt, 5 * 60 * 1000);
    return () => {
      cancel = true;
      clearInterval(iv);
    };
  }, [effectiveLat, effectiveLon]);

  useEffect(() => {
    const iv = window.setInterval(() => setMetricIdx((v) => (v + 1) % 3), 5000);
    return () => window.clearInterval(iv);
  }, []);

  const daily = data?.daily;
  const days = daily?.time || [];
  const idx = Math.min(dayIdx, Math.max(0, days.length - 1));
  const isToday = idx === 0;
  const label = isToday
    ? "Hoje"
    : days[idx]
      ? format(new Date(days[idx] + "T12:00:00"), "EEE, d MMM", { locale: ptBR })
      : "—";

  const temp = isToday
    ? data?.current?.temperature_2m
    : (daily && (daily.temperature_2m_max[idx] + daily.temperature_2m_min[idx]) / 2);
  const code = isToday ? data?.current?.weather_code : daily?.weather_code?.[idx];
  const currentHour = Number(String(data?.current?.time || "").slice(11, 13));
  const isDay = isToday
    ? (data?.current?.is_day != null ? Number(data.current.is_day) === 1 : currentHour >= 6 && currentHour < 18)
    : true;
  const rain = daily?.precipitation_probability_max?.[idx] ?? 0;
  const humidity = isToday ? data?.current?.relative_humidity_2m : null;
  const tmax = daily?.temperature_2m_max?.[idx];
  const tmin = daily?.temperature_2m_min?.[idx];

  return (
    <div style={cardStyle}>
      <div style={{ ...titleStyle, justifyContent: "space-between", minWidth: 0 }}>
        <span className="flex items-center gap-1.5 min-w-0">
          <Cloud size={11} /> Previsão do Tempo
        </span>
        {effectiveCity && (
          <span className="flex items-center gap-1 min-w-0" style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.3, color: PROMO_TEXT, textTransform: "none", whiteSpace: "nowrap" }}>
            <MapPin size={9} style={{ opacity: 0.75, flexShrink: 0 }} />
            <span className="truncate">{effectiveCity}</span>
          </span>
        )}
      </div>

      {!effectiveCity ? (
        <div style={{ fontSize: 11, color: PROMO_MUTED, marginTop: 8 }}>
          Configure a "cidade tempo" em Previsão do Tempo.
        </div>
      ) : loading && !data ? (
        <div className="flex items-center gap-1" style={{ fontSize: 11, color: PROMO_MUTED }}>
          <Loader2 size={12} className="animate-spin" /> Carregando…
        </div>
      ) : data ? (
        <>
          {idx === 0 ? (
            <div className="flex flex-col gap-3 flex-1">
              <div className="flex items-stretch gap-3 flex-1 min-h-0">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="p-1.5 rounded-xl bg-white/5 backdrop-blur-md shrink-0">
                    {weatherIcon(code ?? 0, isDay, 32)}
                  </div>
                  <div className="min-w-0">
                    <div style={{ fontSize: 24, fontWeight: 900, lineHeight: 1, letterSpacing: -1, whiteSpace: "nowrap" }}>
                      {temp != null ? Math.round(temp) : "—"}
                      <span className="text-[12px] font-bold opacity-60 ml-0.5">°C</span>
                    </div>
                    <div className="truncate" style={{ fontSize: 10, color: PROMO_MUTED, fontWeight: 600, marginTop: 2 }}>
                      {weatherLabel(code ?? 0)}
                    </div>
                    <div className="flex items-center gap-2 mt-1" style={{ fontSize: 8, color: PROMO_MUTED, fontWeight: 700, whiteSpace: "nowrap" }}>
                      <span>Min {tmin != null ? Math.round(tmin) : "—"}°</span>
                      <span>Max {tmax != null ? Math.round(tmax) : "—"}°</span>
                    </div>
                  </div>
                </div>

                <div aria-hidden="true" style={{ width: 1, flexShrink: 0, alignSelf: "stretch", background: "rgba(255,255,255,0.22)" }} />

                <div className="flex flex-col justify-center gap-2 shrink-0 pr-1" style={{ minWidth: 88 }}>
                  <div className="flex items-center gap-2" title="Probabilidade de chuva">
                    <CloudRain size={12} className="text-sky-300 shrink-0" />
                    <span className="text-[9px] font-semibold opacity-70">Chuva</span>
                    <span className="ml-auto text-[10px] font-bold tabular-nums">{rain}%</span>
                  </div>
                  <div className="flex items-center gap-2" title="Umidade do ar">
                    <Droplets size={12} className="text-cyan-200 shrink-0" />
                    <span className="text-[9px] font-semibold opacity-70">Umidade</span>
                    <span className="ml-auto text-[10px] font-bold tabular-nums">{humidity != null ? `${humidity}%` : "—"}</span>
                  </div>
                  <div className="flex items-center gap-2" title="Velocidade do vento">
                    <Navigation size={12} className="text-lime-200 shrink-0 rotate-[135deg]" />
                    <span className="text-[9px] font-semibold opacity-70">Vento</span>
                    <span className="ml-auto text-[10px] font-bold tabular-nums">{Math.round(data?.current?.wind_speed_10m ?? 0)} km/h</span>
                  </div>
                </div>
              </div>


            </div>
          ) : (
            <div className="flex items-center gap-3 flex-1 min-h-0">
              <div className="shrink-0 flex items-center justify-center" style={{ width: 56, height: 56 }}>
                {weatherIcon(code ?? 0, true, 48)}
              </div>

              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div style={{ fontSize: 28, fontWeight: 900, lineHeight: 1 }}>
                  {tmin != null && tmax != null ? `${Math.round(tmin)}° / ${Math.round(tmax)}°` : "—"}
                </div>
                <div className="truncate" style={{ fontSize: 10, color: PROMO_MUTED, marginTop: 3 }}>
                  {weatherLabel(code ?? 0)}
                </div>
                <div style={{ fontSize: 9, color: PROMO_MUTED, marginTop: 1 }}>💧 {rain}%</div>
              </div>

            </div>
          )}

          <div className="flex items-center justify-between mt-auto">
            <button
              type="button"
              onClick={() => setDayIdx((v) => Math.max(0, v - 1))}
              disabled={idx === 0}
              className="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
              style={{ background: `color-mix(in srgb, ${PROMO_BORDER} 12%, transparent)`, opacity: idx === 0 ? 0.35 : 1 }}
            >
              <ChevronLeft size={13} />
            </button>

            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: PROMO_MUTED }}>
              {label}
            </span>

            <button
              type="button"
              onClick={() => setDayIdx((v) => Math.min((days.length || 1) - 1, v + 1))}
              disabled={idx >= days.length - 1}
              className="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
              style={{ background: `color-mix(in srgb, ${PROMO_BORDER} 12%, transparent)`, opacity: idx >= days.length - 1 ? 0.35 : 1 }}
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 11, color: PROMO_MUTED }}>Sem dados.</div>
      )}
    </div>
  );
}

// ================= DATAS COMEMORATIVAS =================

function useFeriadosNacionais() {
  return useMemo(() => {
    const year = new Date().getFullYear();
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;

    const pascoa = new Date(year, month - 1, day);
    const carnaval = new Date(pascoa.getTime() - 47 * 86400000);
    const sextaSanta = new Date(pascoa.getTime() - 2 * 86400000);
    const corpusChristi = new Date(pascoa.getTime() + 60 * 86400000);

    return [
      { date: new Date(year, 0, 1), nome: "Confraternização Universal" },
      { date: carnaval, nome: "Carnaval" },
      { date: sextaSanta, nome: "Sexta-feira Santa" },
      { date: new Date(year, 3, 21), nome: "Tiradentes" },
      { date: new Date(year, 4, 1), nome: "Dia do Trabalho" },
      { date: corpusChristi, nome: "Corpus Christi" },
      { date: new Date(year, 8, 7), nome: "Independência do Brasil" },
      { date: new Date(year, 9, 12), nome: "N. Sra. Aparecida" },
      { date: new Date(year, 10, 2), nome: "Finados" },
      { date: new Date(year, 10, 15), nome: "Proclamação da República" },
      { date: new Date(year, 10, 20), nome: "Consciência Negra" },
      { date: new Date(year, 11, 25), nome: "Natal" },
    ];
  }, []);
}

function DatasBox({ userId }: { userId?: string | null }) {
  const feriados = useFeriadosNacionais();
  const [userState, setUserState] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    supabase
      .from("user_settings")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => {
        if (data && (data as any).state_code) setUserState((data as any).state_code);
      });
  }, [userId]);

  const saveUserState = async (state: string) => {
    if (!userId) return;
    setUserState(state);
    await supabase
      .from("user_settings")
      .update({ state_code: state } as any)
      .eq("user_id", userId);
  };

  const items = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const year = today.getFullYear();

    const comem = DATAS_COMEMORATIVAS
      .filter(d => !d.estado || d.estado === userState)
      .map((d) => {
        const thisYear = new Date(year, d.mes - 1, d.dia);
        const nextYear = new Date(year + 1, d.mes - 1, d.dia);
        return { 
          date: thisYear >= today ? thisYear : nextYear, 
          nome: d.nome, 
          tag: d.estado ? d.estado : "Nacional" 
        };
      });

    const fers = feriados.map((f) => ({ date: f.date, nome: f.nome, tag: "Feriado" }));

    return [...comem, ...fers]
      .filter((it) => it.date >= today)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 12);
  }, [feriados, userState]);

  const [idx, setIdx] = useState(0);

  useEffect(() => {
    if (items.length <= 1) return;
    const iv = setInterval(() => setIdx((v) => (v + 1) % items.length), 4500);
    return () => clearInterval(iv);
  }, [items.length]);

  const cur = items[idx];
  const isToday = cur ? (() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return cur.date.getTime() === t.getTime();
  })() : false;

  const [collapsed, toggleCollapsed] = useCollapsed("datas");

  const baseStyle: React.CSSProperties = {
    ...cardStyle,
    ...(isToday && !collapsed ? {
      background: PROMO_ACCENT_GRADIENT,
      border: `1px solid color-mix(in srgb, ${PROMO_BORDER} 55%, transparent)`,
      boxShadow: `0 0 24px color-mix(in srgb, ${PROMO_BORDER} 25%, transparent), 0 4px 20px rgba(0,0,0,0.4)`,
    } : {}),
  };

  return (
    <div style={baseStyle}>
      <div style={titleStyle} className="justify-between">
        <span className="flex items-center gap-1.5 min-w-0">
          <Star size={11} style={{ color: PROMO_BORDER, flexShrink: 0 }} />
          <span className="truncate">Datas Comemorativas</span>
          {collapsed && cur && (
            <span className="truncate" style={{ fontSize: 9, fontWeight: 700, color: PROMO_MUTED, letterSpacing: 0.5, marginLeft: 4 }}>
              · {format(cur.date, "dd/MM")} {cur.nome}
            </span>
          )}
        </span>

        <span className="flex items-center gap-1.5 flex-shrink-0">
          {isToday && !collapsed && (
            <span
              style={{
                fontSize: 8,
                fontWeight: 900,
                letterSpacing: 1.5,
                textTransform: "uppercase",
                padding: "2px 7px",
                borderRadius: 999,
                background: PROMO_BORDER,
                color: PROMO_ACCENT_A,
                boxShadow: `0 0 10px color-mix(in srgb, ${PROMO_BORDER} 70%, transparent)`,
                animation: "promo-datas-pulse 1.4s ease-in-out infinite",
              }}
            >
              ★ Hoje
            </span>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="w-5 h-5 rounded-full flex items-center justify-center transition-colors hover:bg-white/10"
                style={{ background: "rgba(255,255,255,0.08)", color: PROMO_TEXT }}
                title="Configurar Estado"
              >
                <Settings size={9} />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-2 bg-[#0A2540] border-[#00BFF0]/30 shadow-2xl">
              <div className="space-y-1">
                <p className="text-[9px] font-bold text-[#00BFF0] uppercase tracking-wider mb-2 px-2">Filtrar por Estado</p>
                {["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"].map((st) => (
                  <button
                    key={st}
                    onClick={() => saveUserState(st)}
                    className={`w-full text-left px-3 py-1.5 rounded-md text-[10px] font-bold transition-colors ${userState === st ? "bg-[#00BFF0] text-[#0A2540]" : "text-white/70 hover:bg-white/5"}`}
                  >
                    {st}
                  </button>
                ))}
                <button
                  onClick={() => saveUserState("")}
                  className={`w-full text-left px-3 py-1.5 rounded-md text-[10px] font-bold transition-colors ${!userState ? "bg-white/20 text-white" : "text-white/70 hover:bg-white/5"}`}
                >
                  NACIONAL
                </button>
              </div>
            </PopoverContent>
          </Popover>
          {/* CollapseBtn removed as per user request */}
        </span>
      </div>

      {!collapsed && (cur ? (
        <>
          <div
            key={idx}
            className="flex items-center gap-3"
            style={{ animation: "promo-datas-swap 480ms ease-out both" }}
          >
            <div
              className="rounded-md flex flex-col items-center justify-center shrink-0"
              style={{
                width: 44,
                height: 44,
                background: isToday
                  ? `linear-gradient(135deg, ${PROMO_BORDER}, ${PROMO_ACCENT_B})`
                  : PROMO_ACCENT_GRADIENT,
                color: PROMO_TEXT,
                boxShadow: isToday ? `0 0 12px color-mix(in srgb, ${PROMO_BORDER} 60%, transparent)` : "none",
              }}
            >
              <span style={{ fontSize: 16, fontWeight: 900, lineHeight: 1 }}>{format(cur.date, "dd")}</span>
              <span style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", opacity: 0.9, letterSpacing: 0.5 }}>
                {format(cur.date, "MMM", { locale: ptBR }).replace(".", "")}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 800,
                  lineHeight: 1.25,
                  color: isToday ? PROMO_BORDER : PROMO_TEXT,
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  wordBreak: "break-word",
                }}
                title={cur.nome}
              >
                {cur.nome}
              </div>

              <div style={{ fontSize: 9, color: PROMO_MUTED, marginTop: 4, textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>
                {isToday ? "Comemora-se hoje" : `${cur.tag} · ${format(cur.date, "EEE", { locale: ptBR }).replace(".", "")}`}
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between mt-auto">
            <button
              type="button"
              onClick={() => setIdx((v) => (v - 1 + items.length) % items.length)}
              disabled={items.length <= 1}
              className="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
              style={{ background: `color-mix(in srgb, ${PROMO_BORDER} 12%, transparent)`, opacity: items.length <= 1 ? 0.35 : 1 }}
              title="Data anterior"
            >
              <ChevronLeft size={13} />
            </button>

            <div className="flex items-center justify-center gap-1">
              {items.slice(0, 8).map((_, i) => (
                <span
                  key={i}
                  style={{
                    width: 4,
                    height: 4,
                    borderRadius: 999,
                    background: i === idx % 8 ? PROMO_ACCENT_B : `color-mix(in srgb, ${PROMO_BORDER} 20%, transparent)`,
                    transition: "background 300ms ease",
                  }}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={() => setIdx((v) => (v + 1) % items.length)}
              disabled={items.length <= 1}
              className="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
              style={{ background: `color-mix(in srgb, ${PROMO_BORDER} 12%, transparent)`, opacity: items.length <= 1 ? 0.35 : 1 }}
              title="Próxima data"
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 11, color: PROMO_MUTED }}>Sem datas.</div>
      ))}

      <style>{`
        @keyframes promo-weather-swap {
          from { opacity: 0; transform: translateY(5px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes promo-weather-blink {
          to { visibility: hidden; }
        }
        @keyframes promo-datas-pulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }
        @keyframes promo-datas-swap {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

// ================= BLITZ =================

interface BlitzRow {
  id: string;
  dia: string;
  horario: string;
  horario_fim: string | null;
  cliente: string;
  equipe: string | null;
  observacoes: string | null;
  realizada: boolean;
}

function nowHMBrasilia() {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

function todayBrasilia() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

function fmtDataBR(iso: string) {
  const [y, m, d] = iso.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function BlitzBox({ userId }: { userId?: string | null }) {
  const [rows, setRows] = useState<BlitzRow[]>([]);
  const [tick, setTick] = useState(0);
  const [selected, setSelected] = useState<BlitzRow | null>(null);
  const [collapsed, toggleCollapsed] = useCollapsed("blitz");

  useEffect(() => {
    const iv = setInterval(() => setTick((t) => t + 1), 15000);
    return () => clearInterval(iv);
  }, []);


  useEffect(() => {
    if (!userId) { setRows([]); return; }
    let cancelled = false;
    const load = async () => {
      const { data } = await supabase.functions.invoke("public-blitz-data", {
        body: { userId, mode: "upcoming" },
      });
      if (cancelled) return;
      setRows((data?.ok ? (data.rows as BlitzRow[]) : []) || []);
    };
    load();
    const iv = setInterval(load, 60000);
    const ch = supabase
      .channel(`promo-blitz-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "blitz_promocionais", filter: `user_id=eq.${userId}` }, load)
      .subscribe();
    return () => { cancelled = true; clearInterval(iv); supabase.removeChannel(ch); };
  }, [userId]);


  const today = todayBrasilia();
  const hm = nowHMBrasilia();

  const acontecendo = useMemo(() => {
    void tick;
    return rows.filter((b) => {
      if (b.dia !== today) return false;
      const ini = (b.horario || "").slice(0, 5);
      const fim = (b.horario_fim || "").slice(0, 5);
      if (ini && hm < ini) return false;
      if (fim && hm > fim) return false;
      return true;
    });
  }, [rows, tick, today, hm]);

  const proxima = useMemo(() => {
    void tick;
    return rows.find((b) => {
      if (b.dia > today) return true;
      if (b.dia < today) return false;
      const ini = (b.horario || "").slice(0, 5);
      return ini > hm;
    }) || null;
  }, [rows, tick, today, hm]);

  return (
    <>
      <div style={cardStyle}>
        <div style={titleStyle} className="justify-between">
          <span className="flex items-center gap-1.5 min-w-0">
            <Sparkles size={11} style={{ color: PROMO_BORDER, flexShrink: 0 }} />
            <span className="truncate">Blitz Promocional</span>
            {collapsed && acontecendo.length > 0 && (
              <span className="truncate" style={{ fontSize: 9, fontWeight: 700, color: PROMO_MUTED, letterSpacing: 0.5, marginLeft: 4 }}>
                · {acontecendo.length} ao vivo
              </span>
            )}
          </span>
          <span className="flex items-center gap-1.5 flex-shrink-0">
            {acontecendo.length > 0 && !collapsed && (
              <span
                style={{
                  fontSize: 8, fontWeight: 900, letterSpacing: 1.5, textTransform: "uppercase",
                  padding: "2px 7px", borderRadius: 999, background: PROMO_BORDER, color: PROMO_ACCENT_A,
                  boxShadow: `0 0 10px color-mix(in srgb, ${PROMO_BORDER} 70%, transparent)`,
                  animation: "promo-datas-pulse 1.4s ease-in-out infinite",
                }}
              >
                 ● AO VIVO
              </span>
            )}
            {/* CollapseBtn removed as per user request */}
          </span>
        </div>

        {!collapsed && (
          acontecendo.length === 0 ? (
            <div style={{ fontSize: 11, color: PROMO_MUTED, marginTop: 6 }}>
              Nenhuma blitz acontecendo agora.
              {proxima && (
                <div style={{ fontSize: 10, marginTop: 6, color: PROMO_MUTED }}>
                  Próxima: <strong style={{ color: PROMO_TEXT }}>{proxima.cliente}</strong> · {fmtDataBR(proxima.dia)} às {(proxima.horario || "").slice(0, 5)}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto" style={{ marginTop: 2 }}>
              {acontecendo.map((b) => {
                const ini = (b.horario || "").slice(0, 5);
                const fim = (b.horario_fim || "").slice(0, 5);
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setSelected(b)}
                    className="w-full text-left flex items-center gap-2 rounded-md transition-colors"
                    style={{
                      padding: "6px 8px",
                      marginBottom: 4,
                      background: `color-mix(in srgb, ${PROMO_BORDER} 6%, transparent)`,
                      color: PROMO_TEXT,
                      cursor: "pointer",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = `color-mix(in srgb, ${PROMO_BORDER} 14%, transparent)`; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = `color-mix(in srgb, ${PROMO_BORDER} 6%, transparent)`; }}
                  >
                    <span style={{
                      width: 6, height: 6, borderRadius: 999, background: PROMO_ACCENT_B, flexShrink: 0,
                      boxShadow: `0 0 8px ${PROMO_ACCENT_B}`,
                    }} />
                    <span className="flex-1 min-w-0">
                      <span className="block truncate" style={{ fontSize: 12, fontWeight: 800 }}>{b.cliente}</span>
                      <span className="block" style={{ fontSize: 9, color: PROMO_MUTED, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 700 }}>
                        {ini}{fim ? `–${fim}` : ""}{b.equipe ? ` · ${b.equipe}` : ""}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          )
        )}
      </div>

      {selected && createPortal(
        <div
          onClick={() => setSelected(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 9999,
            background: "rgba(0,0,0,0.65)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center", padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%", maxWidth: 460,
              background: PROMO_CARD_BG,
              borderRadius: 18, color: PROMO_TEXT, overflow: "hidden",
              fontFamily: "'Montserrat', sans-serif",
              boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
            }}
          >
            <div style={{
              padding: "14px 18px", background: PROMO_ACCENT_GRADIENT,
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div className="flex items-center gap-2 min-w-0">
                <Sparkles size={16} style={{ color: PROMO_BORDER }} />
                <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: 2, textTransform: "uppercase" }}>Blitz Promocional</span>
              </div>
              <button
                onClick={() => setSelected(null)}
                style={{
                  width: 28, height: 28, borderRadius: 999,
                  background: "rgba(255,255,255,0.15)", color: PROMO_TEXT, border: "none",
                  display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
                }}
                title="Fechar"
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ padding: 18 }}>
              <div style={{ fontSize: 20, fontWeight: 900, lineHeight: 1.2 }}>{selected.cliente}</div>
              <div style={{ fontSize: 11, color: PROMO_MUTED, marginTop: 8, letterSpacing: 1, textTransform: "uppercase", fontWeight: 700 }}>
                {fmtDataBR(selected.dia)} · {(selected.horario || "").slice(0, 5)}{selected.horario_fim ? `–${selected.horario_fim.slice(0, 5)}` : ""}
              </div>
              {selected.equipe && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 9, color: PROMO_MUTED, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 800 }}>Equipe</div>
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 3 }}>{selected.equipe}</div>
                </div>
              )}
              {selected.observacoes && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 9, color: PROMO_MUTED, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 800 }}>Observações</div>
                  <div style={{ fontSize: 12, marginTop: 3, lineHeight: 1.45, whiteSpace: "pre-wrap" }}>{selected.observacoes}</div>
                </div>
              )}

              <div style={{
                marginTop: 18, padding: 14, borderRadius: 12,
                background: `color-mix(in srgb, ${PROMO_BORDER} 8%, transparent)`,
                border: `1px dashed color-mix(in srgb, ${PROMO_BORDER} 30%, transparent)`,
              }}>
                <div style={{ fontSize: 9, color: PROMO_MUTED, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 800 }}>Próxima Blitz</div>
                {proxima ? (
                  <div style={{ marginTop: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 800 }}>{proxima.cliente}</div>
                    <div style={{ fontSize: 11, color: PROMO_MUTED, marginTop: 2, letterSpacing: 0.5, textTransform: "uppercase", fontWeight: 700 }}>
                      {fmtDataBR(proxima.dia)} às {(proxima.horario || "").slice(0, 5)}{proxima.horario_fim ? `–${proxima.horario_fim.slice(0, 5)}` : ""}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 12, marginTop: 6, color: PROMO_MUTED, fontStyle: "italic" }}>
                    Não há próxima blitz cadastrada.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

export default function PromoInfoBoxes({ weatherCity, weatherLat, weatherLon, userId }: Props) {
  return (
    <div
      className="grid gap-3 mb-3"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}
    >
      <WeatherBox weatherCity={weatherCity} weatherLat={weatherLat} weatherLon={weatherLon} userId={userId} />
      <DatasBox userId={userId} />
      <BlitzBox userId={userId} />
    </div>
  );
}
