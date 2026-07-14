import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Map as MapIcon, Navigation } from "lucide-react";
import {
  Cloud, CloudRain, Sun, CloudSnow, CloudLightning, Wind,
  ChevronLeft, ChevronRight, Star, MapPin, Settings, Car,
  TrendingUp, TrendingDown, RefreshCcw, Loader2, DollarSign,
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

const cardStyle: React.CSSProperties = {
  background: CARD_BG,
  border: CARD_BORDER,
  boxShadow: CARD_SHADOW,
  borderRadius: 14,
  padding: "10px 14px",
  color: TEXT,
  minHeight: 92,
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
  color: "rgba(255,255,255,0.75)",
  fontFamily: "'Montserrat', sans-serif",
  display: "flex",
  alignItems: "center",
  gap: 6,
};

// ================= WEATHER =================
function weatherIcon(code: number, size = 26) {
  const c = code;
  const cls = { color: TEXT } as React.CSSProperties;
  if (c === 0 || c === 1) return <Sun size={size} style={{ ...cls, color: "#FFD34D" }} />;
  if (c <= 3) return <Cloud size={size} style={cls} />;
  if (c === 45 || c === 48) return <Wind size={size} style={cls} />;
  if (c >= 51 && c <= 67) return <CloudRain size={size} style={{ ...cls, color: "#7EC8FF" }} />;
  if (c >= 71 && c <= 77) return <CloudSnow size={size} style={cls} />;
  if (c >= 80 && c <= 82) return <CloudRain size={size} style={{ ...cls, color: "#7EC8FF" }} />;
  if (c >= 95) return <CloudLightning size={size} style={{ ...cls, color: "#FFD34D" }} />;
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
      } catch { /* ignore */ }
      finally { if (!cancel) setLoading(false); }
    };
    fetchIt();
    const iv = setInterval(fetchIt, 15 * 60 * 1000);
    return () => { cancel = true; clearInterval(iv); };
  }, [weatherLat, weatherLon]);

  const daily = data?.daily;
  const days = daily?.time || [];
  const idx = Math.min(dayIdx, Math.max(0, days.length - 1));
  const isToday = idx === 0;
  const label = isToday ? "Hoje" : days[idx]
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
        <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>
          Configure a "cidade tempo" em Previsão do Tempo.
        </div>
      ) : loading && !data ? (
        <div className="flex items-center gap-1" style={{ fontSize: 11, color: MUTED }}>
          <Loader2 size={12} className="animate-spin" /> Carregando…
        </div>
      ) : data ? (
        <>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              {weatherIcon(code ?? 0, 32)}
              <div className="min-w-0">
                <div style={{ fontSize: 22, fontWeight: 900, lineHeight: 1 }}>
                  {temp != null ? Math.round(temp) : "—"}°<span style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>C</span>
                </div>
                <div className="truncate" style={{ fontSize: 10, color: MUTED, marginTop: 2 }}>
                  {weatherLabel(code ?? 0)}
                </div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: TEXT, opacity: 0.9 }} className="truncate max-w-[110px]">
                <MapPin size={9} className="inline -mt-0.5 mr-0.5" />
                {weatherCity}
              </div>
              <div style={{ fontSize: 9, color: MUTED, marginTop: 1 }}>
                {tmin != null && tmax != null ? `${Math.round(tmin)}° / ${Math.round(tmax)}°` : ""}
              </div>
              <div style={{ fontSize: 9, color: MUTED }}>💧 {rain}%</div>
            </div>
          </div>
          <div className="flex items-center justify-between mt-auto">
            <button
              type="button"
              onClick={() => setDayIdx((v) => Math.max(0, v - 1))}
              disabled={idx === 0}
              className="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
              style={{ background: "rgba(255,255,255,0.08)", opacity: idx === 0 ? 0.35 : 1 }}
            >
              <ChevronLeft size={13} />
            </button>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", color: MUTED }}>
              {label}
            </span>
            <button
              type="button"
              onClick={() => setDayIdx((v) => Math.min((days.length || 1) - 1, v + 1))}
              disabled={idx >= days.length - 1}
              className="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
              style={{ background: "rgba(255,255,255,0.08)", opacity: idx >= days.length - 1 ? 0.35 : 1 }}
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </>
      ) : (
        <div style={{ fontSize: 11, color: MUTED }}>Sem dados.</div>
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
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return cur.date.getTime() === t.getTime();
  })() : false;

  return (
    <div
      style={{
        ...cardStyle,
        ...(isToday ? {
          background: "linear-gradient(160deg, rgba(215,13,14,0.35) 0%, rgba(0,0,0,0.85) 100%)",
          border: "1px solid rgba(255,211,77,0.55)",
          boxShadow: "0 0 24px rgba(255,211,77,0.25), 0 4px 20px rgba(0,0,0,0.4)",
        } : {}),
      }}
    >
      <div style={titleStyle} className="justify-between">
        <span className="flex items-center gap-1.5">
          <Star size={11} style={{ color: "#FFD34D" }} /> Datas Comemorativas
        </span>
        {isToday && (
          <span
            style={{
              fontSize: 8, fontWeight: 900, letterSpacing: 1.5, textTransform: "uppercase",
              padding: "2px 7px", borderRadius: 999,
              background: "#FFD34D", color: "#000",
              boxShadow: "0 0 10px rgba(255,211,77,0.7)",
              animation: "promo-datas-pulse 1.4s ease-in-out infinite",
            }}
          >
            ★ Hoje
          </span>
        )}
      </div>
      {cur ? (
        <>
          <div className="flex items-center gap-3">
            <div
              className="rounded-md flex flex-col items-center justify-center shrink-0"
              style={{
                width: 42, height: 42,
                background: isToday
                  ? "linear-gradient(135deg, #FFD34D, #E08900)"
                  : "linear-gradient(135deg, #d70d0e, #7a0505)",
                color: isToday ? "#000" : TEXT,
                boxShadow: isToday ? "0 0 12px rgba(255,211,77,0.6)" : "none",
              }}
            >
              <span style={{ fontSize: 15, fontWeight: 900, lineHeight: 1 }}>{format(cur.date, "dd")}</span>
              <span style={{ fontSize: 8, fontWeight: 700, textTransform: "uppercase", opacity: 0.9 }}>
                {format(cur.date, "MMM", { locale: ptBR }).replace(".", "")}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <div
                style={{
                  fontSize: 12, fontWeight: 800, lineHeight: 1.2,
                  color: isToday ? "#FFD34D" : TEXT,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
                title={cur.nome}
              >
                {cur.nome}
              </div>
              <div style={{ fontSize: 9, color: MUTED, marginTop: 3, textTransform: "uppercase", letterSpacing: 1 }}>
                {isToday ? "Comemora-se hoje" : `${cur.tag} · ${format(cur.date, "EEE", { locale: ptBR }).replace(".", "")}`}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-1 mt-auto">
            {items.slice(0, 8).map((_, i) => (
              <span key={i} style={{
                width: 4, height: 4, borderRadius: 999,
                background: i === idx % 8 ? ACCENT : "rgba(255,255,255,0.2)",
              }} />
            ))}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 11, color: MUTED }}>Sem datas.</div>
      )}
      <style>{`
        @keyframes promo-datas-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 10px rgba(255,211,77,0.7); }
          50% { transform: scale(1.06); box-shadow: 0 0 18px rgba(255,211,77,1); }
        }
      `}</style>
    </div>
  );
}

// ================= TRÂNSITO =================
const LS_TRAFFIC_CITY = "promo-traffic-city";

function TrafficBox({ fallbackCity }: { fallbackCity: string | null }) {
  const [city, setCity] = useState<string>(() => {
    try { return localStorage.getItem(LS_TRAFFIC_CITY) || fallbackCity || ""; } catch { return fallbackCity || ""; }
  });
  const [tmpCity, setTmpCity] = useState(city);
  const [open, setOpen] = useState(false);
  const [jams, setJams] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [idx, setIdx] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    if (!city && fallbackCity) setCity(fallbackCity);
  }, [fallbackCity, city]);

  const fetchIt = useCallback(async () => {
    if (!city) return;
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke("fetch-traffic", { body: { city } });
      if (data?.ok) {
        setJams(data.jams || []);
        setUpdatedAt(data.updatedAt || null);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [city]);

  useEffect(() => {
    fetchIt();
    const iv = setInterval(fetchIt, 3 * 60 * 1000);
    return () => clearInterval(iv);
  }, [fetchIt]);

  useEffect(() => {
    if (jams.length <= 1) return;
    const iv = setInterval(() => setIdx((v) => (v + 1) % jams.length), 5000);
    return () => clearInterval(iv);
  }, [jams.length]);

  const j = jams[idx];
  const delayMin = j ? Math.round((j.delaySec || 0) / 60) : 0;
  const levelColor = j ? (j.level >= 4 ? "#ff2d2d" : j.level >= 3 ? "#ff8a1f" : "#ffd23d") : MUTED;

  return (
    <div style={cardStyle}>
      <div style={titleStyle} className="justify-between">
        <span className="flex items-center gap-1.5"><Car size={11} /> Trânsito</span>
        <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setTmpCity(city); }}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="w-5 h-5 rounded-full flex items-center justify-center transition-colors"
              style={{ background: "rgba(255,255,255,0.08)", color: TEXT }}
              title="Definir cidade do trânsito"
            >
              <Settings size={10} />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="p-3 w-56" style={{ background: "#111", border: "1px solid rgba(255,255,255,0.12)", color: TEXT }}>
            <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, color: MUTED, marginBottom: 6 }}>
              Cidade do trânsito
            </div>
            <input
              value={tmpCity}
              onChange={(e) => setTmpCity(e.target.value)}
              placeholder="Ex: Goiânia, GO"
              className="w-full px-2 py-1.5 rounded"
              style={{ background: "#000", border: "1px solid rgba(255,255,255,0.15)", color: TEXT, fontSize: 12 }}
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={() => setOpen(false)}
                className="px-2 py-1 rounded"
                style={{ fontSize: 10, color: MUTED }}
              >Cancelar</button>
              <button
                onClick={() => {
                  const v = tmpCity.trim();
                  setCity(v);
                  try { localStorage.setItem(LS_TRAFFIC_CITY, v); } catch { /* ignore */ }
                  setOpen(false);
                }}
                className="px-2 py-1 rounded"
                style={{ fontSize: 10, background: ACCENT, color: TEXT, fontWeight: 800 }}
              >Salvar</button>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      {!city ? (
        <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>Defina uma cidade.</div>
      ) : loading && !jams.length ? (
        <div className="flex items-center gap-1" style={{ fontSize: 11, color: MUTED }}>
          <Loader2 size={12} className="animate-spin" /> Buscando…
        </div>
      ) : !jams.length ? (
        <div style={{ fontSize: 11, color: MUTED }}>
          Sem congestionamentos em <b style={{ color: TEXT }}>{city}</b>.
        </div>
      ) : j ? (
        <>
          <div className="flex items-center gap-2">
            <div
              className="rounded-md flex flex-col items-center justify-center shrink-0"
              style={{ width: 42, height: 42, background: `linear-gradient(135deg, ${levelColor}, rgba(0,0,0,0.7))` }}
              title={`Nível ${j.level || 1} de 5`}
            >
              <span style={{ fontSize: 14, fontWeight: 900, lineHeight: 1, color: "#000" }}>{delayMin}</span>
              <span style={{ fontSize: 7, fontWeight: 800, textTransform: "uppercase", color: "#000" }}>min</span>
            </div>
            <div className="min-w-0 flex-1">
              <div
                style={{
                  fontSize: 13.5, fontWeight: 900, lineHeight: 1.2,
                  color: "#ffffff",
                  textShadow: "0 1px 2px rgba(0,0,0,0.85)",
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  letterSpacing: 0.2,
                }}
                title={j.street}
              >
                {j.street}
              </div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <span
                  style={{
                    fontSize: 8, fontWeight: 900, letterSpacing: 0.5, textTransform: "uppercase",
                    padding: "1px 6px", borderRadius: 999,
                    background: levelColor, color: "#000",
                  }}
                >
                  {j.level >= 4 ? "Crítico" : j.level >= 3 ? "Intenso" : j.level >= 2 ? "Moderado" : "Leve"}
                </span>
                <span style={{ fontSize: 9, color: MUTED, textTransform: "uppercase", letterSpacing: 1 }}>
                  {j.lengthM ? `${(j.lengthM / 1000).toFixed(1)} km` : ""}
                  {j.speedKmh != null ? ` · ${j.speedKmh} km/h` : ""}
                </span>
              </div>
            </div>
          </div>

          {/* Legenda de criticidade */}
          <div className="flex items-center justify-between gap-1" style={{ fontSize: 8, color: MUTED, textTransform: "uppercase", letterSpacing: 0.5 }}>
            <span className="flex items-center gap-1"><span style={{ width: 6, height: 6, borderRadius: 999, background: "#ffd23d" }} />Leve</span>
            <span className="flex items-center gap-1"><span style={{ width: 6, height: 6, borderRadius: 999, background: "#ffd23d" }} />Mod.</span>
            <span className="flex items-center gap-1"><span style={{ width: 6, height: 6, borderRadius: 999, background: "#ff8a1f" }} />Intenso</span>
            <span className="flex items-center gap-1"><span style={{ width: 6, height: 6, borderRadius: 999, background: "#ff2d2d" }} />Crítico</span>
          </div>

          <div className="flex items-center justify-between mt-auto gap-2">
            <span style={{ fontSize: 8, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase" }}>
              {updatedAt ? format(new Date(updatedAt), "dd/MM HH:mm", { locale: ptBR }) : "—"}
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setIdx((v) => (v - 1 + jams.length) % jams.length)}
                className="w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.08)", color: TEXT }}
                title="Anterior"
              >
                <ChevronLeft size={11} />
              </button>
              <span style={{ fontSize: 9, fontWeight: 800, color: MUTED, minWidth: 26, textAlign: "center" }}>
                {idx + 1}/{jams.length}
              </span>
              <button
                type="button"
                onClick={() => setIdx((v) => (v + 1) % jams.length)}
                className="w-5 h-5 rounded-full flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.08)", color: TEXT }}
                title="Próximo"
              >
                <ChevronRight size={11} />
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

// ================= COTAÇÕES =================
function CotacoesBox() {
  const [quotes, setQuotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const first = useRef(true);

  const fetchIt = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("https://economia.awesomeapi.com.br/last/USD-BRL,EUR-BRL", { cache: "no-store" });
      const data = await res.json();
      const list: any[] = [];
      const push = (key: string, name: string, flag: string) => {
        const q = data?.[key];
        if (!q) return;
        const bid = parseFloat(q.bid);
        const pct = parseFloat(q.pctChange);
        list.push({
          name,
          flag,
          value: bid.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 }),
          pct,
          up: pct >= 0,
          when: q.create_date ? new Date(q.create_date.replace(" ", "T")) : null,
        });
      };
      push("USDBRL", "Dólar", "🇺🇸");
      push("EURBRL", "Euro", "🇪🇺");
      setQuotes(list);
      const last = list.map((q) => q.when).filter(Boolean) as Date[];
      if (last.length) setUpdatedAt(new Date(Math.max(...last.map((d) => d.getTime()))));
    } catch { /* ignore */ }
    finally { setLoading(false); first.current = false; }
  }, []);

  useEffect(() => {
    fetchIt();
    const iv = setInterval(fetchIt, 10 * 60 * 1000);
    return () => clearInterval(iv);
  }, [fetchIt]);

  return (
    <div style={cardStyle}>
      <div style={titleStyle} className="justify-between">
        <span className="flex items-center gap-1.5"><DollarSign size={11} /> Cotações</span>
        <button
          onClick={fetchIt}
          className="w-5 h-5 rounded-full flex items-center justify-center transition-colors"
          style={{ background: "rgba(255,255,255,0.08)", color: TEXT }}
          title="Atualizar"
        >
          <RefreshCcw size={9} className={loading ? "animate-spin" : ""} />
        </button>
      </div>
      {loading && !quotes.length ? (
        <div className="flex items-center gap-1" style={{ fontSize: 11, color: MUTED }}>
          <Loader2 size={12} className="animate-spin" /> Carregando…
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {quotes.map((q) => (
            <div key={q.name} className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0">
                <span style={{ fontSize: 16 }}>{q.flag}</span>
                <span style={{ fontSize: 11, fontWeight: 800 }}>{q.name}</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="tabular-nums" style={{ fontSize: 13, fontWeight: 900 }}>R$ {q.value}</span>
                <span
                  className="flex items-center gap-0.5"
                  style={{ fontSize: 9, fontWeight: 800, color: q.up ? "#4ade80" : "#ff6b6b" }}
                >
                  {q.up ? <TrendingUp size={9} /> : <TrendingDown size={9} />}
                  {q.pct >= 0 ? "+" : ""}{q.pct.toFixed(2)}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-auto" style={{ fontSize: 8, color: MUTED, letterSpacing: 0.5, textTransform: "uppercase" }}>
        Atualizado: {updatedAt ? format(updatedAt, "dd/MM HH:mm", { locale: ptBR }) : "—"}
      </div>
    </div>
  );
}

// ================= MAIN =================
export default function PromoInfoBoxes(props: Props) {
  return (
    <div
      className="w-full px-2"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
        gap: 10,
        marginBottom: 8,
      }}
    >
      <WeatherBox {...props} />
      <DatasBox />
      <TrafficBox fallbackCity={props.weatherCity} />
      <CotacoesBox />
    </div>
  );
}
