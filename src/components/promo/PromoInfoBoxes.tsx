import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Map as MapIcon, Navigation } from "lucide-react";
import {
  Cloud, CloudRain, Sun, CloudSnow, CloudLightning, Wind,
  ChevronLeft, ChevronRight, Star, MapPin, Settings, Car,
  TrendingUp, TrendingDown, RefreshCcw, Loader2, DollarSign, Sparkles,
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
                  {temp != null ? Math.round(temp) : "—"}°<span style={{ fontSize: 11, fontWeight: 700, opacity: 0.7 }}>C</span>
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
    const t = new Date(); t.setHours(0, 0, 0, 0);
    return cur.date.getTime() === t.getTime();
  })() : false;

  return (
    <div
      style={{
        ...cardStyle,
        ...(isToday ? {
          background: PROMO_ACCENT_GRADIENT,
          border: `1px solid color-mix(in srgb, ${PROMO_BORDER} 55%, transparent)`,
          boxShadow: `0 0 24px color-mix(in srgb, ${PROMO_BORDER} 25%, transparent), 0 4px 20px rgba(0,0,0,0.4)`,
        } : {}),
      }}
    >
      <div style={titleStyle} className="justify-between">
        <span className="flex items-center gap-1.5">
          <Star size={11} style={{ color: PROMO_BORDER }} /> Datas Comemorativas
        </span>
        {isToday && (
          <span
            style={{
              fontSize: 8, fontWeight: 900, letterSpacing: 1.5, textTransform: "uppercase",
              padding: "2px 7px", borderRadius: 999,
              background: PROMO_BORDER, color: PROMO_ACCENT_A,
              boxShadow: `0 0 10px color-mix(in srgb, ${PROMO_BORDER} 70%, transparent)`,
              animation: "promo-datas-pulse 1.4s ease-in-out infinite",
            }}
          >
            ★ Hoje
          </span>
        )}
      </div>
      {cur ? (
        <>
          <div
            key={idx}
            className="flex items-center gap-3"
            style={{ animation: "promo-datas-swap 480ms ease-out both" }}
          >
            <div
              className="rounded-md flex flex-col items-center justify-center shrink-0"
              style={{
                width: 42, height: 42,
                background: isToday
                  ? `linear-gradient(135deg, ${PROMO_BORDER}, ${PROMO_ACCENT_B})`
                  : PROMO_ACCENT_GRADIENT,
                color: PROMO_TEXT,
                boxShadow: isToday ? `0 0 12px color-mix(in srgb, ${PROMO_BORDER} 60%, transparent)` : "none",
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
                  color: isToday ? PROMO_BORDER : PROMO_TEXT,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                }}
                title={cur.nome}
              >
                {cur.nome}
              </div>
              <div style={{ fontSize: 9, color: PROMO_MUTED, marginTop: 3, textTransform: "uppercase", letterSpacing: 1 }}>
                {isToday ? "Comemora-se hoje" : `${cur.tag} · ${format(cur.date, "EEE", { locale: ptBR }).replace(".", "")}`}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-center gap-1 mt-auto">
            {items.slice(0, 8).map((_, i) => (
              <span key={i} style={{
                width: 4, height: 4, borderRadius: 999,
                background: i === idx % 8 ? PROMO_ACCENT_B : `color-mix(in srgb, ${PROMO_BORDER} 20%, transparent)`,
                transition: "background 300ms ease",
              }} />
            ))}
          </div>
        </>
      ) : (
        <div style={{ fontSize: 11, color: PROMO_MUTED }}>Sem datas.</div>
      )}
      <style>{`
        @keyframes promo-datas-pulse {
          0%, 100% { transform: scale(1); box-shadow: 0 0 10px rgba(255,211,77,0.7); }
          50% { transform: scale(1.06); box-shadow: 0 0 18px rgba(255,211,77,1); }
        }
        @keyframes promo-datas-swap {
          0%   { opacity: 0; transform: translateY(6px); filter: blur(2px); }
          60%  { opacity: 1; filter: blur(0); }
          100% { opacity: 1; transform: translateY(0); filter: blur(0); }
        }
      `}</style>
    </div>
  );
}

// ================= TRÂNSITO =================
const LS_TRAFFIC_CITY = "promo-traffic-city";
const TOMTOM_BROWSER_KEY = "yojLAvHVJViICV1wu3PTvYdqWZ1q5svw";

function loadLeaflet(): Promise<any> {
  const w = window as any;
  if (w.L) return Promise.resolve(w.L);
  return new Promise((resolve, reject) => {
    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }
    let script = document.getElementById("leaflet-js") as HTMLScriptElement | null;
    if (script) {
      script.addEventListener("load", () => resolve((window as any).L));
      script.addEventListener("error", reject);
      return;
    }
    script = document.createElement("script");
    script.id = "leaflet-js";
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.onload = () => resolve((window as any).L);
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function TrafficMapModal({
  city, center, jams, onClose,
}: {
  city: string;
  center: { lat: number; lon: number } | null;
  jams: any[];
  onClose: () => void;
}) {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const focusJam = useCallback((i: number) => {
    const map = mapRef.current;
    const m = markersRef.current[i];
    const jm = jams[i];
    if (!map || !jm || jm.lat == null || jm.lon == null) return;
    setActiveIdx(i);
    map.flyTo([jm.lat, jm.lon], 16, { duration: 0.8 });
    setTimeout(() => { if (m) m.openPopup(); }, 850);
  }, [jams]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = await loadLeaflet();
      if (cancelled || !mapDivRef.current) return;
      const c = center || { lat: jams[0]?.lat ?? -23.55, lon: jams[0]?.lon ?? -46.63 };
      const map = L.map(mapDivRef.current, { zoomControl: true, scrollWheelZoom: true })
        .setView([c.lat, c.lon], 12);
      mapRef.current = map;

      // Base map
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 19,
      }).addTo(map);

      // TomTom traffic flow overlay
      L.tileLayer(
        `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${TOMTOM_BROWSER_KEY}`,
        { opacity: 0.85, maxZoom: 22 }
      ).addTo(map);

      // Incident markers
      const bounds: any[] = [[c.lat, c.lon]];
      markersRef.current = [];
      jams.forEach((jm, i) => {
        if (jm.lat == null || jm.lon == null) { markersRef.current.push(null); return; }
        const color = jm.level >= 4 ? "#ff2d2d" : jm.level >= 3 ? "#ff8a1f" : "#ffd23d";
        const delayMin = Math.round((jm.delaySec || 0) / 60);
        const html = `
          <div style="position:relative;transform:translate(-50%,-100%);pointer-events:auto;">
            <div style="display:flex;align-items:center;gap:0;filter:drop-shadow(0 4px 8px rgba(0,0,0,0.55));">
              <div style="
                background:#000;color:#fff;font-weight:900;font-size:14px;
                width:26px;height:32px;display:flex;align-items:center;justify-content:center;
                border-radius:8px 0 0 8px;border:2px solid ${color};border-right:none;
                font-family:'Montserrat',sans-serif;">
                ${i + 1}
              </div>
              <div style="
                background:${color};color:#000;font-weight:900;font-size:14px;
                height:32px;padding:0 10px;display:flex;align-items:center;
                border-radius:0 8px 8px 0;border:2px solid ${color};
                white-space:nowrap;font-family:'Montserrat',sans-serif;letter-spacing:0.3px;">
                ${delayMin}<span style="font-size:9px;font-weight:800;margin-left:2px;">MIN</span>
              </div>
            </div>
            <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-top:9px solid ${color};margin:-1px auto 0;"></div>
          </div>`;
        const icon = L.divIcon({ html, className: "", iconSize: [0, 0], iconAnchor: [0, 0] });
        const marker = L.marker([jm.lat, jm.lon], { icon, zIndexOffset: 1000 - i }).addTo(map);
        const popupHtml = `
          <div style="font-family:'Montserrat',sans-serif;min-width:200px;">
            <div style="font-weight:900;font-size:13px;margin-bottom:4px;color:#111;">${i + 1}. ${jm.street}</div>
            <div style="font-size:11px;color:#555;margin-bottom:8px;">
              <b style="color:${color === '#ffd23d' ? '#b48000' : color}">${delayMin} min</b> de atraso · ${jm.lengthM ? (jm.lengthM / 1000).toFixed(1) + " km" : ""}
            </div>
            <a href="https://www.google.com/maps/dir/?api=1&destination=${jm.lat},${jm.lon}&travelmode=driving"
               target="_blank" rel="noopener noreferrer"
               style="display:inline-flex;align-items:center;gap:4px;background:#d70d0e;color:#fff;
                      padding:6px 12px;border-radius:6px;font-weight:800;font-size:11px;
                      text-decoration:none;text-transform:uppercase;letter-spacing:0.5px;">
              ▶ Navegar
            </a>
          </div>`;
        marker.bindPopup(popupHtml);
        marker.on("click", () => setActiveIdx(i));
        markersRef.current.push(marker);
        bounds.push([jm.lat, jm.lon]);
      });

      if (bounds.length > 1) {
        try { map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 }); } catch { /* ignore */ }
      }

      // Force resize after modal render
      setTimeout(() => map.invalidateSize(), 100);
    })();

    return () => {
      cancelled = true;
      markersRef.current = [];
      if (mapRef.current) { try { mapRef.current.remove(); } catch { /* ignore */ } mapRef.current = null; }
    };
  }, [city, center, jams]);

  const node = (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px",
        overflowY: "auto",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "min(1100px, 96vw)",
          height: "min(680px, calc(100vh - 32px))",
          maxHeight: "calc(100vh - 32px)",
          margin: "auto",
          background: "#0a0a0a", border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
          display: "flex", flexDirection: "column", overflow: "hidden",
        }}
      >
        <div
          className="flex items-center gap-3 px-4"
          style={{ minHeight: 56, borderBottom: "1px solid rgba(255,255,255,0.08)", background: "#111" }}
        >
          <div className="flex items-center gap-2 shrink-0" style={{ color: TEXT }}>
            <MapIcon size={16} style={{ color: ACCENT }} />
            <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.5 }}>
              Mapa de Trânsito
            </span>
            <span style={{ fontSize: 11, color: MUTED, marginLeft: 2 }}>· {city}</span>
          </div>

          {/* Chips com os pontos críticos */}
          <div
            className="flex items-center gap-1.5 flex-1 overflow-x-auto py-2"
            style={{ scrollbarWidth: "thin" }}
          >
            {jams.map((jm, i) => {
              const color = jm.level >= 4 ? "#ff2d2d" : jm.level >= 3 ? "#ff8a1f" : "#ffd23d";
              const delayMin = Math.round((jm.delaySec || 0) / 60);
              const active = activeIdx === i;
              return (
                <button
                  key={i}
                  onClick={() => focusJam(i)}
                  className="shrink-0 rounded-full flex items-center gap-1.5 px-2 py-1 transition-all"
                  style={{
                    background: active ? color : "rgba(255,255,255,0.06)",
                    border: `1px solid ${active ? color : "rgba(255,255,255,0.12)"}`,
                    color: active ? "#000" : TEXT,
                    fontSize: 10, fontWeight: 800,
                    fontFamily: "'Montserrat',sans-serif",
                    maxWidth: 220,
                    boxShadow: active ? `0 0 12px ${color}80` : "none",
                  }}
                  title={jm.street}
                >
                  <span
                    style={{
                      background: active ? "#000" : color, color: active ? "#fff" : "#000",
                      width: 16, height: 16, borderRadius: 999,
                      display: "inline-flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, fontWeight: 900, flexShrink: 0,
                    }}
                  >{i + 1}</span>
                  <span className="truncate" style={{ maxWidth: 130 }}>{jm.street}</span>
                  <span style={{ opacity: 0.85, fontSize: 9 }}>· {delayMin}min</span>
                </button>
              );
            })}
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "rgba(255,255,255,0.08)", color: TEXT }}
            title="Fechar"
          >
            <X size={16} />
          </button>
        </div>
        <div style={{ flex: 1, position: "relative" }}>
          <div ref={mapDivRef} style={{ position: "absolute", inset: 0 }} />
          {/* Legend */}
          <div
            style={{
              position: "absolute", bottom: 12, left: 12, zIndex: 500,
              background: "rgba(0,0,0,0.75)", color: TEXT, padding: "8px 12px",
              borderRadius: 10, fontSize: 10, fontFamily: "'Montserrat',sans-serif",
              border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(4px)",
            }}
          >
            <div style={{ fontWeight: 900, fontSize: 9, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4, color: MUTED }}>
              Criticidade
            </div>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1"><span style={{ width: 10, height: 10, borderRadius: 999, background: "#ffd23d" }} /> Leve</span>
              <span className="flex items-center gap-1"><span style={{ width: 10, height: 10, borderRadius: 999, background: "#ff8a1f" }} /> Intenso</span>
              <span className="flex items-center gap-1"><span style={{ width: 10, height: 10, borderRadius: 999, background: "#ff2d2d" }} /> Crítico</span>
            </div>
          </div>
          {/* Instructions */}
          <div
            style={{
              position: "absolute", top: 12, right: 12, zIndex: 500,
              background: "rgba(0,0,0,0.75)", color: TEXT, padding: "6px 10px",
              borderRadius: 10, fontSize: 10, fontFamily: "'Montserrat',sans-serif",
              border: "1px solid rgba(255,255,255,0.15)", backdropFilter: "blur(4px)",
              display: "flex", alignItems: "center", gap: 5,
            }}
          >
            <Navigation size={11} style={{ color: ACCENT }} />
            Clique nos pontos para navegar
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(node, document.body);
}

function TrafficBox({ fallbackCity }: { fallbackCity: string | null }) {
  const [city, setCity] = useState<string>(() => {
    try { return localStorage.getItem(LS_TRAFFIC_CITY) || fallbackCity || ""; } catch { return fallbackCity || ""; }
  });
  const [tmpCity, setTmpCity] = useState(city);
  const [open, setOpen] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [jams, setJams] = useState<any[]>([]);
  const [center, setCenter] = useState<{ lat: number; lon: number } | null>(null);
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
        if (data.center?.lat != null && data.center?.lon != null) setCenter(data.center);
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
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setMapOpen(true)}
            disabled={!city}
            className="rounded-full flex items-center justify-center"
            style={{
              width: 22, height: 22,
              background: city ? ACCENT : "rgba(255,255,255,0.08)",
              color: "#fff",
              boxShadow: city ? "0 0 8px rgba(215,13,14,0.55)" : "none",
              opacity: city ? 1 : 0.4,
            }}
            title="Abrir mapa do trânsito"
          >
            <MapIcon size={12} />
          </button>
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
      </div>

      {mapOpen && (
        <TrafficMapModal
          city={city}
          center={center}
          jams={jams}
          onClose={() => setMapOpen(false)}
        />
      )}

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
                  fontSize: 12, fontWeight: 800, lineHeight: 1.2,
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

// ================= HORÓSCOPO =================
const SIGNOS: { nome: string; emoji: string; periodo: string; leituras: string[] }[] = [
  { nome: "Áries", emoji: "♈", periodo: "21/03 - 19/04", leituras: [
    "Energia em alta para iniciar projetos. Confie no seu instinto e aja com coragem.",
    "Dia de ação: aproveite para resolver pendências. Cuidado com a impaciência.",
    "Novas oportunidades surgem no trabalho. Mantenha o foco e evite conflitos.",
  ]},
  { nome: "Touro", emoji: "♉", periodo: "20/04 - 20/05", leituras: [
    "Estabilidade financeira em foco. Boa fase para investir em conforto e prazeres.",
    "Paciência trará recompensas. Priorize a família e relações próximas.",
    "Momento de organizar as finanças e valorizar o que já conquistou.",
  ]},
  { nome: "Gêmeos", emoji: "♊", periodo: "21/05 - 20/06", leituras: [
    "Comunicação fluída favorece negócios. Um contato antigo pode te surpreender.",
    "Dia versátil: aposte em ideias novas e conversas produtivas.",
    "Curiosidade em alta. Bom momento para aprender algo diferente.",
  ]},
  { nome: "Câncer", emoji: "♋", periodo: "21/06 - 22/07", leituras: [
    "Emoções à flor da pele. Cuide de si e valorize o lar.",
    "Intuição aguçada guia decisões importantes. Confie no coração.",
    "Momento de acolher quem ama. Boas notícias familiares chegam.",
  ]},
  { nome: "Leão", emoji: "♌", periodo: "23/07 - 22/08", leituras: [
    "Brilho pessoal em destaque. Aproveite para se posicionar e liderar.",
    "Reconhecimento profissional se aproxima. Mantenha a generosidade.",
    "Dia criativo: use seu carisma para conquistar apoio.",
  ]},
  { nome: "Virgem", emoji: "♍", periodo: "23/08 - 22/09", leituras: [
    "Organização será sua aliada. Detalhes farão a diferença hoje.",
    "Foco na saúde e rotina. Pequenas mudanças trazem grandes resultados.",
    "Bom momento para planejar e otimizar o tempo. Evite autocobrança.",
  ]},
  { nome: "Libra", emoji: "♎", periodo: "23/09 - 22/10", leituras: [
    "Harmonia nos relacionamentos. Bom dia para acordos e parcerias.",
    "Equilíbrio é a chave. Beleza e arte inspiram sua rotina.",
    "Dia diplomático: evite tomar partido em conflitos alheios.",
  ]},
  { nome: "Escorpião", emoji: "♏", periodo: "23/10 - 21/11", leituras: [
    "Intensidade guia suas escolhas. Transformações positivas se aproximam.",
    "Percepção afiada revela verdades ocultas. Use com sabedoria.",
    "Momento de renovação. Deixe o passado ir e abrace o novo.",
  ]},
  { nome: "Sagitário", emoji: "♐", periodo: "22/11 - 21/12", leituras: [
    "Otimismo abre portas. Aventuras e estudos favorecidos.",
    "Expanda horizontes: uma viagem ou curso pode transformar sua semana.",
    "Liberdade em foco. Confie no futuro e siga em frente.",
  ]},
  { nome: "Capricórnio", emoji: "♑", periodo: "22/12 - 19/01", leituras: [
    "Determinação em alta. Metas de carreira ganham impulso.",
    "Disciplina traz resultados sólidos. Reconhecimento a caminho.",
    "Dia produtivo para planejar o longo prazo. Não abra mão dos seus valores.",
  ]},
  { nome: "Aquário", emoji: "♒", periodo: "20/01 - 18/02", leituras: [
    "Ideias inovadoras se destacam. Amizades trazem boas surpresas.",
    "Liberdade e originalidade guiam seu dia. Ouse ser diferente.",
    "Bom momento para causas coletivas e novas conexões.",
  ]},
  { nome: "Peixes", emoji: "♓", periodo: "19/02 - 20/03", leituras: [
    "Sensibilidade elevada inspira criações. Ouça sua intuição.",
    "Dia contemplativo: arte, música e espiritualidade te acolhem.",
    "Empatia abre portas. Cuide do descanso e das emoções.",
  ]},
];

function dayOfYear(d: Date) {
  const start = new Date(d.getFullYear(), 0, 0);
  return Math.floor((d.getTime() - start.getTime()) / 86400000);
}

function leituraDoDia(signoIdx: number) {
  const s = SIGNOS[signoIdx];
  const idx = (dayOfYear(new Date()) + signoIdx) % s.leituras.length;
  return s.leituras[idx];
}

// Elementos para composição da leitura longa (usada no popup)
const ELEMENTO_POR_SIGNO: Record<string, "fogo" | "terra" | "ar" | "agua"> = {
  "Áries": "fogo", "Leão": "fogo", "Sagitário": "fogo",
  "Touro": "terra", "Virgem": "terra", "Capricórnio": "terra",
  "Gêmeos": "ar", "Libra": "ar", "Aquário": "ar",
  "Câncer": "agua", "Escorpião": "agua", "Peixes": "agua",
};

const COMPLEMENTOS: Record<"fogo" | "terra" | "ar" | "agua", string[]> = {
  fogo: [
    "Vênus favorece encontros inspiradores e traz motivação extra para colocar planos antigos em prática.",
    "A Lua ilumina sua vitalidade e pede que você use a coragem sem atropelar os detalhes ao longo do dia.",
    "Marte impulsiona sua ação e amplia o carisma em reuniões, apresentações e conversas decisivas.",
  ],
  terra: [
    "A Lua reforça a paciência e favorece decisões práticas ligadas ao dinheiro, ao trabalho e à rotina.",
    "Mercúrio traz clareza para negociações e ajuda a organizar acordos que estavam parados há dias.",
    "Saturno pede consistência: o que for construído hoje com calma tende a se sustentar por muito tempo.",
  ],
  ar: [
    "Mercúrio deixa sua mente rápida e favorece trocas, mensagens e reuniões que abrem novas portas.",
    "Vênus estimula acordos leves e traz um ar diplomático perfeito para resolver mal-entendidos recentes.",
    "A Lua desperta curiosidade e pede que você compartilhe ideias sem medo de mostrar seu ponto de vista.",
  ],
  agua: [
    "A Lua conecta você às emoções e favorece conversas honestas que fortalecem laços afetivos importantes.",
    "Netuno amplia a intuição e pede atenção aos sinais sutis que aparecem em sonhos, encontros e escolhas.",
    "Vênus acolhe seu coração e traz momentos de aconchego ao lado de quem realmente merece sua confiança.",
  ],
};

function leituraLongaDoDia(signoIdx: number): string {
  const s = SIGNOS[signoIdx];
  const base = leituraDoDia(signoIdx);
  const el = ELEMENTO_POR_SIGNO[s.nome] || "ar";
  const pool = COMPLEMENTOS[el];
  const extra = pool[(dayOfYear(new Date()) + signoIdx) % pool.length];
  return `${base} ${extra}`;
}

function HoroscopoBox() {
  const [idx, setIdx] = useState(0);
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState<number | null>(null);

  useEffect(() => {
    const iv = setInterval(() => setIdx((v) => (v + 1) % SIGNOS.length), 6000);
    return () => clearInterval(iv);
  }, []);

  const s = SIGNOS[idx];
  const leitura = leituraDoDia(idx);

  return (
    <>
      <div style={cardStyle}>
        <div style={titleStyle} className="justify-between">
          <span className="flex items-center gap-1.5"><Sparkles size={11} /> Horóscopo</span>
          <button
            onClick={() => { setChosen(idx); setOpen(true); }}
            className="w-5 h-5 rounded-full flex items-center justify-center transition-colors"
            style={{ background: "rgba(255,255,255,0.08)", color: TEXT }}
            title="Escolher signo"
          >
            <Star size={9} />
          </button>
        </div>
        <div key={idx} className="flex items-center" style={{ animation: "fadeIn 0.4s", gap: "clamp(6px, 1vw, 10px)" }}>
          <span style={{ fontSize: "clamp(20px, 2.4vw, 28px)", lineHeight: 1, flexShrink: 0 }}>{s.emoji}</span>
          <div className="flex flex-col min-w-0" style={{ flex: 1 }}>
            <span
              className="truncate"
              style={{ fontSize: "clamp(10px, 1.05vw, 13px)", fontWeight: 900, letterSpacing: 0.5, lineHeight: 1.1 }}
            >
              {s.nome}
            </span>
            <span
              className="truncate"
              style={{ fontSize: "clamp(7px, 0.75vw, 9px)", color: MUTED, letterSpacing: 0.3, lineHeight: 1.2 }}
            >
              {s.periodo}
            </span>
          </div>
        </div>
        <div
          key={`t-${idx}`}
          style={{
            fontSize: "clamp(9px, 0.85vw, 11px)",
            lineHeight: 1.35,
            color: `color-mix(in srgb, ${PROMO_TEXT} 88%, transparent)`,
            display: "-webkit-box",
            WebkitLineClamp: 3,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            wordBreak: "break-word",
            hyphens: "auto",
          }}
        >
          {leitura}
        </div>
        <div className="mt-auto flex items-center justify-between gap-1" style={{ fontSize: "clamp(7px, 0.65vw, 9px)", color: MUTED, letterSpacing: 0.4, textTransform: "uppercase" }}>
          <span className="tabular-nums">{idx + 1}/{SIGNOS.length}</span>
          <span className="truncate">Signo do dia</span>
        </div>
      </div>

      {open && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center p-6"
          style={{
            background: "radial-gradient(circle at 50% 40%, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.88) 100%)",
            backdropFilter: "blur(10px)",
          }}
          onClick={() => setOpen(false)}
        >
          <style>{`
            @keyframes horoGlowPulse {
              0%, 100% {
                box-shadow: 0 0 0 1px color-mix(in srgb, ${PROMO_BORDER} 70%, transparent),
                            0 0 16px 1px color-mix(in srgb, ${PROMO_BORDER} 35%, transparent),
                            inset 0 0 10px color-mix(in srgb, ${PROMO_BORDER} 18%, transparent);
              }
              50% {
                box-shadow: 0 0 0 1px ${PROMO_BORDER},
                            0 0 28px 4px color-mix(in srgb, ${PROMO_BORDER} 55%, transparent),
                            inset 0 0 18px color-mix(in srgb, ${PROMO_BORDER} 35%, transparent);
              }
            }
            @keyframes horoGlyphShine {
              0%, 100% { filter: drop-shadow(0 0 4px color-mix(in srgb, ${PROMO_BORDER} 55%, transparent)); }
              50% { filter: drop-shadow(0 0 12px ${PROMO_BORDER}); }
            }
            @keyframes horoFadeIn {
              from { opacity: 0; transform: translateY(6px); }
              to { opacity: 1; transform: translateY(0); }
            }
          `}</style>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded-3xl overflow-hidden relative"
            style={{
              maxWidth: 780,
              background: PROMO_CARD_BG,
              border: `1px solid color-mix(in srgb, ${PROMO_BORDER} 22%, transparent)`,
              boxShadow: `0 30px 90px rgba(0,0,0,0.7), 0 0 0 1px color-mix(in srgb, ${PROMO_BORDER} 8%, transparent)`,
              color: PROMO_TEXT,
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-8 py-5"
              style={{
                borderBottom: `1px solid color-mix(in srgb, ${PROMO_BORDER} 12%, transparent)`,
                background: `linear-gradient(90deg, color-mix(in srgb, ${PROMO_ACCENT_A} 45%, transparent), transparent)`,
              }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center"
                  style={{
                    background: PROMO_CARD_BG,
                    border: `1px solid color-mix(in srgb, ${PROMO_BORDER} 30%, transparent)`,
                    boxShadow: `0 0 22px color-mix(in srgb, ${PROMO_BORDER} 35%, transparent)`,
                  }}
                >
                  <Sparkles size={18} style={{ color: PROMO_BORDER }} />
                </div>
                <div className="flex flex-col">
                  <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: 2, fontFamily: "'Montserrat', sans-serif", color: PROMO_HEADER }}>
                    HORÓSCOPO DO DIA
                  </span>
                  <span style={{ fontSize: 10, color: PROMO_MUTED, letterSpacing: 1, textTransform: "uppercase" }}>
                    {format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:scale-105"
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: `1px solid color-mix(in srgb, ${PROMO_BORDER} 20%, transparent)`,
                  color: PROMO_TEXT,
                }}
              >
                <X size={16} />
              </button>
            </div>

            {/* Signs grid */}
            <div
              className="grid grid-cols-6 gap-3 px-8 py-6"
              style={{ borderBottom: `1px solid color-mix(in srgb, ${PROMO_BORDER} 12%, transparent)` }}
            >
              {SIGNOS.map((sg, i) => {
                const isChosen = chosen === i;
                return (
                  <button
                    key={sg.nome}
                    onClick={() => setChosen(i)}
                    className="flex flex-col items-center gap-2 rounded-2xl py-3 px-2 transition-all hover:scale-[1.04]"
                    style={{
                      background: PROMO_CARD_BG,
                      border: isChosen
                        ? `1px solid ${PROMO_BORDER}`
                        : `1px solid color-mix(in srgb, ${PROMO_BORDER} 12%, transparent)`,
                      animation: isChosen ? "horoGlowPulse 1.6s ease-in-out infinite" : undefined,
                    }}
                    title={sg.nome}
                  >
                    <span
                      className="flex items-center justify-center rounded-full"
                      style={{
                        width: 40,
                        height: 40,
                        background: isChosen
                          ? `radial-gradient(circle at 50% 40%, color-mix(in srgb, ${PROMO_BORDER} 28%, transparent) 0%, transparent 70%)`
                          : `radial-gradient(circle at 50% 40%, color-mix(in srgb, ${PROMO_BORDER} 12%, transparent) 0%, transparent 70%)`,
                      }}
                    >
                      <span
                        style={{
                          fontSize: 24,
                          lineHeight: 1,
                          color: PROMO_TEXT,
                          animation: isChosen ? "horoGlyphShine 1.6s ease-in-out infinite" : undefined,
                          textShadow: isChosen
                            ? `0 0 12px ${PROMO_BORDER}`
                            : `0 0 5px color-mix(in srgb, ${PROMO_BORDER} 25%, transparent)`,
                        }}
                      >
                        {sg.emoji}
                      </span>
                    </span>
                    <span
                      style={{
                        fontSize: 9,
                        fontWeight: 800,
                        letterSpacing: 0.6,
                        textTransform: "uppercase",
                        color: isChosen ? PROMO_HEADER : `color-mix(in srgb, ${PROMO_HEADER} 70%, transparent)`,
                      }}
                    >
                      {sg.nome}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Chosen description */}
            {chosen !== null && (
              <div
                key={`desc-${chosen}`}
                className="px-8 py-7"
                style={{ animation: "horoFadeIn 0.4s ease-out" }}
              >
                <div className="flex items-center gap-4 mb-5">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{
                      background: PROMO_CARD_BG,
                      border: `1px solid color-mix(in srgb, ${PROMO_BORDER} 35%, transparent)`,
                      boxShadow: `0 0 26px color-mix(in srgb, ${PROMO_BORDER} 35%, transparent)`,
                    }}
                  >
                    <span style={{ fontSize: 36, lineHeight: 1, color: PROMO_TEXT, textShadow: `0 0 12px ${PROMO_BORDER}` }}>
                      {SIGNOS[chosen].emoji}
                    </span>
                  </div>
                  <div className="flex flex-col">
                    <span
                      style={{
                        fontSize: 26,
                        fontWeight: 900,
                        letterSpacing: 1,
                        fontFamily: "'Montserrat', sans-serif",
                        color: PROMO_HEADER,
                      }}
                    >
                      {SIGNOS[chosen].nome}
                    </span>
                    <span
                      style={{
                        fontSize: 11,
                        color: PROMO_MUTED,
                        letterSpacing: 1,
                        textTransform: "uppercase",
                        fontWeight: 600,
                      }}
                    >
                      {SIGNOS[chosen].periodo}
                    </span>
                  </div>
                </div>

                <div
                  className="rounded-2xl p-5"
                  style={{
                    background: PROMO_CARD_BG,
                    border: `1px solid color-mix(in srgb, ${PROMO_BORDER} 14%, transparent)`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 16,
                      lineHeight: 1.6,
                      color: PROMO_TEXT,
                      fontWeight: 400,
                      letterSpacing: 0.2,
                      display: "-webkit-box",
                      WebkitLineClamp: 5,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {leituraLongaDoDia(chosen)}
                  </div>
                  <div
                    className="mt-4 flex items-center gap-2 pt-4"
                    style={{
                      borderTop: `1px solid color-mix(in srgb, ${PROMO_BORDER} 12%, transparent)`,
                      fontSize: 10,
                      color: PROMO_MUTED,
                      letterSpacing: 1.5,
                      textTransform: "uppercase",
                      fontWeight: 700,
                    }}
                  >
                    <Star size={11} style={{ color: PROMO_BORDER }} /> Leitura do dia
                  </div>
                </div>
              </div>
            )}

          </div>
        </div>,
        document.body
      )}
    </>
  );
}

// ================= MAIN =================
export default function PromoInfoBoxes(props: Props) {
  return (
    <div
      className="w-full px-2"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
        gap: 10,
        marginBottom: 8,
      }}
    >
      <WeatherBox {...props} />
      <DatasBox />
      <TrafficBox fallbackCity={props.weatherCity} />
      <CotacoesBox />
      <HoroscopoBox />
    </div>
  );
}
