import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Map as MapIcon, Navigation } from "lucide-react";
import {
  Cloud, CloudRain, Sun, CloudSnow, CloudLightning, Wind,
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
  border: `1px solid color-mix(in srgb, ${PROMO_BORDER} 18%, transparent)`,
  boxShadow: CARD_SHADOW,
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
      className="w-5 h-5 rounded-full flex items-center justify-center transition-colors"
      style={{ background: "rgba(255,255,255,0.08)", color: PROMO_TEXT }}
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

function weatherIcon(code: number, size = 26) {
  const c = code;
  const cls = { color: PROMO_TEXT } as React.CSSProperties;
  if (c === 0 || c === 1) return <Sun size={size} style={{ ...cls, color: PROMO_BORDER }} />;
  if (c <= 3) return <Cloud size={size} style={cls} />;
  if (c === 45 || c === 48) return <Wind size={size} style={cls} />;
  if (c >= 51 && c <= 67) return <CloudRain size={size} style={{ ...cls, color: PROMO_ACCENT_B }} />;
  if (c >= 71 && c <= 77) return <CloudSnow size={size} style={cls} />;
  if (c >= 80 && c <= 82) return <CloudRain size={size} style={{ ...cls, color: PROMO_ACCENT_B }} />;
  if (c >= 95) return <CloudLightning size={size} style={{ ...cls, color: PROMO_BORDER }} />;
  return <Cloud size={size} style={cls} />;
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

function WeatherBox({ weatherCity, weatherLat, weatherLon }: Props) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [dayIdx, setDayIdx] = useState(0);

  useEffect(() => {
    if (weatherLat == null || weatherLon == null) return;
    let cancel = false;

    const fetchIt = async () => {
      setLoading(true);
      try {
        const { data: resp } = await supabase.functions.invoke("fetch-weather", {
          body: { action: "forecast", lat: weatherLat, lon: weatherLon, forecast_days: 6 },
        });
        if (!cancel && resp?.ok) setData(resp.data);
      } catch {
        // ignore
      } finally {
        if (!cancel) setLoading(false);
      }
    };

    fetchIt();
    const iv = setInterval(fetchIt, 15 * 60 * 1000);
    return () => {
      cancel = true;
      clearInterval(iv);
    };
  }, [weatherLat, weatherLon]);

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
  const rain = daily?.precipitation_probability_max?.[idx] ?? 0;
  const tmax = daily?.temperature_2m_max?.[idx];
  const tmin = daily?.temperature_2m_min?.[idx];

  return (
    <div style={cardStyle}>
      <div style={titleStyle}>
        <Cloud size={11} /> Previsão do Tempo
      </div>

      {!weatherCity ? (
        <div style={{ fontSize: 11, color: PROMO_MUTED, marginTop: 8 }}>
          Configure a "cidade tempo" em Previsão do Tempo.
        </div>
      ) : loading && !data ? (
        <div className="flex items-center gap-1" style={{ fontSize: 11, color: PROMO_MUTED }}>
          <Loader2 size={12} className="animate-spin" /> Carregando…
        </div>
      ) : data ? (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              {weatherIcon(code ?? 0, 32)}
              <div className="min-w-0">
                <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
                  {temp != null ? Math.round(temp) : "—"}°
                  <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>C</span>
                </div>
                <div className="truncate" style={{ fontSize: 10, color: PROMO_MUTED, marginTop: 2 }}>
                  {weatherLabel(code ?? 0)}
                </div>
              </div>
            </div>

            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: PROMO_TEXT, opacity: 0.9 }} className="truncate max-w-[110px]">
                <MapPin size={9} className="inline -mt-0.5 mr-0.5" />
                {weatherCity}
              </div>
              <div style={{ fontSize: 9, color: PROMO_MUTED, marginTop: 1 }}>
                {tmin != null && tmax != null ? `${Math.round(tmin)}° / ${Math.round(tmax)}°` : ""}
              </div>
              <div style={{ fontSize: 9, color: PROMO_MUTED }}>💧 {rain}%</div>
            </div>
          </div>

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

function DatasBox() {
  const feriados = useFeriadosNacionais();

  const items = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const year = today.getFullYear();

    const comem = DATAS_COMEMORATIVAS.map((d) => {
      const thisYear = new Date(year, d.mes - 1, d.dia);
      const nextYear = new Date(year + 1, d.mes - 1, d.dia);
      return { date: thisYear >= today ? thisYear : nextYear, nome: d.nome, tag: "Nacional" };
    });

    const fers = feriados.map((f) => ({ date: f.date, nome: f.nome, tag: "Feriado" }));

    return [...comem, ...fers]
      .filter((it) => it.date >= today)
      .sort((a, b) => a.date.getTime() - b.date.getTime())
      .slice(0, 12);
  }, [feriados]);

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
    <div style={collapsed ? collapsedCardStyle(baseStyle) : baseStyle}>
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
          <CollapseBtn collapsed={collapsed} onToggle={toggleCollapsed} />
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

          <div className="flex items-center justify-center gap-1 mt-auto">
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
        </>
      ) : (
        <div style={{ fontSize: 11, color: PROMO_MUTED }}>Sem datas.</div>
      ))}

      <style>{`
        @keyframes promo-datas-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 10px*
