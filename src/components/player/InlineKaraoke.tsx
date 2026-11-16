import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Mic, Minus, Plus, RotateCcw, X, Zap } from "lucide-react";

import { playerSupabase } from "@/integrations/supabase/playerClient";
import { usePlayerAuth } from "@/hooks/usePlayerAuth";
import { musicStartKey } from "@/lib/musicStorageKeys";

interface LrcLine { time: number; text: string; }

function parseLrc(lrc: string): LrcLine[] {
  const out: LrcLine[] = [];
  for (const raw of lrc.split("\n")) {
    const m = raw.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/);
    if (m) {
      const t = parseInt(m[1]) * 60 + parseInt(m[2]) + parseInt(m[3].padEnd(3, "0")) / 1000;
      const text = m[4].trim();
      if (text) out.push({ time: t, text });
    }
  }
  return out;
}

interface Props {
  enabled: boolean;
  artist?: string | null;
  title?: string | null;
  duration?: number;
  audioElement?: HTMLAudioElement | null;
  onClose?: () => void;
}

const DEFAULT_LATENCY = 30; // seconds (streaming buffer)
const OFFSET_KEY = "player_karaoke_offset_v1";
const AUTOSYNC_KEY = "player_karaoke_autosync_v1";
const HISTORY_KEY = "player_karaoke_offset_history_v1"; // last user-confirmed offsets

function loadOffsetHistory(): number[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((n) => Number.isFinite(n)).slice(-8) : [];
  } catch { return []; }
}
function pushOffsetHistory(value: number) {
  try {
    const arr = loadOffsetHistory();
    arr.push(value);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(-8)));
  } catch {}
}

export default function InlineKaraoke({ enabled, artist, title, duration, audioElement, onClose }: Props) {

  const { user } = usePlayerAuth();
  const MUSIC_START_KEY = musicStartKey(user?.id) || "masterview_music_start::__none__";

  const [lines, setLines] = useState<LrcLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [idx, setIdx] = useState(-1);
  const [autoSync, setAutoSync] = useState<boolean>(() => {
    try { return localStorage.getItem(AUTOSYNC_KEY) !== "false"; } catch { return true; }
  });
  const [offset, setOffset] = useState<number>(() => {
    try {
      const v = parseFloat(localStorage.getItem(OFFSET_KEY) || "");
      return Number.isFinite(v) ? v : DEFAULT_LATENCY;
    } catch { return DEFAULT_LATENCY; }
  });
  const lastKeyRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);

  // Drift-correction state: track manual adjustments within the current song
  // to derive a linear drift rate (seconds of offset shift per second played).
  const driftRef = useRef<{ points: Array<{ at: number; offset: number }>; rate: number; baseAt: number; baseOffset: number }>({
    points: [], rate: 0, baseAt: 0, baseOffset: 0,
  });
  const commitTimerRef = useRef<number | null>(null);
  const songStartMsRef = useRef<number>(Date.now());

  useEffect(() => {
    try { localStorage.setItem(OFFSET_KEY, String(offset)); } catch {}
    // debounce commit into history + drift regression
    if (commitTimerRef.current) window.clearTimeout(commitTimerRef.current);
    commitTimerRef.current = window.setTimeout(() => {
      pushOffsetHistory(offset);
      // register drift point (seconds since song start → confirmed offset)
      const secs = Math.max(0.1, (Date.now() - songStartMsRef.current) / 1000);
      const pts = driftRef.current.points;
      pts.push({ at: secs, offset });
      // keep last 6 within this song
      while (pts.length > 6) pts.shift();
      // linear regression rate (least squares, slope)
      if (pts.length >= 2) {
        const n = pts.length;
        const sx = pts.reduce((s, p) => s + p.at, 0);
        const sy = pts.reduce((s, p) => s + p.offset, 0);
        const sxx = pts.reduce((s, p) => s + p.at * p.at, 0);
        const sxy = pts.reduce((s, p) => s + p.at * p.offset, 0);
        const denom = n * sxx - sx * sx;
        const slope = denom !== 0 ? (n * sxy - sx * sy) / denom : 0;
        // clamp to plausible drift (±0.5s per minute → ±0.0083/s)
        driftRef.current.rate = Math.max(-0.01, Math.min(0.01, slope));
        driftRef.current.baseAt = secs;
        driftRef.current.baseOffset = offset;
      } else {
        driftRef.current.rate = 0;
        driftRef.current.baseAt = secs;
        driftRef.current.baseOffset = offset;
      }
    }, 700);
  }, [offset]);

  useEffect(() => {
    try { localStorage.setItem(AUTOSYNC_KEY, String(autoSync)); } catch {}
  }, [autoSync]);


  // Fetch lyrics on song change
  useEffect(() => {
    if (!enabled) return;
    const key = `${artist || ""}||${title || ""}`;
    if (!artist || !title || title === "Sem título") {
      setLines([]); setNotFound(false); setLoading(false); return;
    }
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    // reset drift tracking for the new song
    songStartMsRef.current = Date.now();
    driftRef.current = { points: [], rate: 0, baseAt: 0, baseOffset: offset };
    // auto-sync: warm start from user's recent offset history (median)
    if (autoSync) {
      const hist = loadOffsetHistory();
      if (hist.length >= 2) {
        const sorted = [...hist].sort((a, b) => a - b);
        const median = sorted[Math.floor(sorted.length / 2)];
        if (Number.isFinite(median) && Math.abs(median - offset) > 0.24) {
          setOffset(Math.round(median * 100) / 100);
        }
      }
    }

    setLines([]); setIdx(-1); setNotFound(false); setLoading(true);
    let cancelled = false;

    playerSupabase.functions.invoke("fetch-lyrics", {
      body: { artist, title, duration: duration ? Math.round(duration) : undefined },
    }).then(({ data, error }) => {
      if (cancelled || lastKeyRef.current !== key) return;
      setLoading(false);
      if (error || !data?.success || !data?.syncedLyrics) { setNotFound(true); return; }
      const parsed = parseLrc(data.syncedLyrics);
      if (parsed.length === 0) { setNotFound(true); return; }
      setLines(parsed);
    }).catch(() => {
      if (cancelled || lastKeyRef.current !== key) return;
      setLoading(false); setNotFound(true);
    });

    return () => { cancelled = true; };
  }, [enabled, artist, title, duration]);

  // Sync current line — offset is user-tunable to compensate stream delay
  useEffect(() => {
    if (!enabled || lines.length === 0) return;
    const tick = () => {
      // apply drift compensation: extra shift accumulated since last confirmed point
      let effectiveOffset = offset;
      if (autoSync && driftRef.current.rate !== 0) {
        const secs = (Date.now() - songStartMsRef.current) / 1000;
        const extra = (secs - driftRef.current.baseAt) * driftRef.current.rate;
        // clamp extra correction to ±1.5s to avoid runaway
        effectiveOffset = offset + Math.max(-1.5, Math.min(1.5, extra));
      }
      let elapsed: number | null = null;
      if (audioElement && Number.isFinite(audioElement.currentTime) && audioElement.currentTime > 0) {
        elapsed = audioElement.currentTime - effectiveOffset;
      } else {
        const startStr = localStorage.getItem(MUSIC_START_KEY);
        if (startStr) elapsed = (Date.now() - parseInt(startStr, 10)) / 1000 - effectiveOffset;
      }
      if (elapsed !== null) {
        let cur = -1;
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].time <= elapsed) cur = i; else break;
        }
        setIdx((prev) => (prev === cur ? prev : cur));
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [enabled, lines, audioElement, MUSIC_START_KEY, offset, autoSync]);

  // Render fixed 5 slots (-2..+2) with stable keys so lines animate between positions
  const window5 = useMemo(() => {
    if (lines.length === 0) return [] as { line: LrcLine; rel: number; key: string }[];
    const cur = Math.max(0, idx);
    const out: { line: LrcLine; rel: number; key: string }[] = [];
    for (let d = -2; d <= 2; d++) {
      const i = cur + d;
      if (i >= 0 && i < lines.length) out.push({ line: lines[i], rel: d, key: `${lines[i].time}-${i}` });
    }
    return out;
  }, [lines, idx]);

  if (!enabled) return null;

  const SLOT_PX = 34;      // vertical distance between slots
  const CONTAINER_H = 168; // fixed container height → no page layout shift

  return (
    <div
      className="mt-3 w-full max-w-[560px] mx-auto animate-fade-in"
      aria-live="polite"
      style={{
        padding: "24px 26px 20px",
        borderRadius: 32,
        background: "linear-gradient(180deg, rgba(25,25,28,0.92) 0%, rgba(12,12,14,0.96) 100%)",
        border: "1px solid rgba(255,255,255,0.24)",
        backdropFilter: "blur(28px) saturate(140%)",
        WebkitBackdropFilter: "blur(28px) saturate(140%)",
        boxShadow: "0 40px 100px -20px rgba(0,0,0,0.95), 0 0 0 1px rgba(255,255,255,0.06), inset 0 1px 0 rgba(255,255,255,0.12)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-white/60">
          <Mic size={11} /> karaokê
          {autoSync && driftRef.current.rate !== 0 && (
            <span className="normal-case tracking-normal text-[9px] text-white/45 ml-1">· auto ativo</span>
          )}
        </div>
        {/* Offset adjuster — finer 0.25s steps */}
        <div className="flex items-center gap-1 text-white/70" title="Ajuste o atraso da letra para casar com o áudio">
          <button
            onClick={() => setAutoSync((v) => !v)}
            className={
              "mr-1 w-6 h-6 rounded-full flex items-center justify-center border transition " +
              (autoSync
                ? "border-emerald-400/60 bg-emerald-400/15 text-emerald-200 hover:bg-emerald-400/25"
                : "border-white/15 hover:bg-white/10 text-white/70")
            }
            aria-label={autoSync ? "Desativar auto-ajuste" : "Ativar auto-ajuste"}
            title={autoSync ? "Auto-ajuste de sincronia: ligado" : "Auto-ajuste de sincronia: desligado"}
            data-focusable
          >
            <Zap size={11} />
          </button>
          <button
            onClick={() => setOffset((o) => Math.round((o + 0.25) * 100) / 100)}
            className="w-6 h-6 rounded-full flex items-center justify-center border border-white/15 hover:bg-white/10 transition"
            aria-label="Atrasar letra 0,25s"
            data-focusable
          >
            <Minus size={11} />
          </button>
          <div className="min-w-[54px] text-center text-[10px] tabular-nums text-white/80">
            {offset > 0 ? `+${offset.toFixed(2)}s` : `${offset.toFixed(2)}s`}
          </div>
          <button
            onClick={() => setOffset((o) => Math.round((o - 0.25) * 100) / 100)}
            className="w-6 h-6 rounded-full flex items-center justify-center border border-white/15 hover:bg-white/10 transition"
            aria-label="Adiantar letra 0,25s"
            data-focusable
          >
            <Plus size={11} />
          </button>
          <button
            onClick={() => setOffset(DEFAULT_LATENCY)}
            className="ml-1 w-6 h-6 rounded-full flex items-center justify-center border border-white/15 hover:bg-white/10 transition"
            aria-label="Restaurar offset padrão"
            title="Restaurar padrão"
            data-focusable
          >
            <RotateCcw size={10} />
          </button>
          {onClose && (
            <button
              onClick={onClose}
              className="ml-2 w-6 h-6 rounded-full flex items-center justify-center border border-white/15 hover:bg-white/10 hover:border-white/30 transition"
              aria-label="Fechar karaokê"
              title="Fechar karaokê"
              data-focusable
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>


      {loading && (
        <div className="text-center text-[12px] text-white/60 italic" style={{ height: CONTAINER_H, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Loader2 size={20} className="animate-spin" style={{ color: "#737982" }} aria-label="Carregando letra" />
          <span>buscando letra…</span>
        </div>
      )}

      {!loading && notFound && (
        <div className="text-center text-[13px] text-white/75 leading-snug italic" style={{ height: CONTAINER_H, display: "flex", alignItems: "center", justifyContent: "center" }}>
          Ihh essa letra eu não aprendi ainda …
        </div>
      )}

      {!loading && !notFound && lines.length > 0 && (
        <div
          className="relative overflow-hidden"
          style={{
            height: CONTAINER_H,
            maskImage: "linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)",
            WebkitMaskImage: "linear-gradient(180deg, transparent 0%, #000 22%, #000 78%, transparent 100%)",
          }}
        >
          {window5.map(({ line, rel, key }) => {
            const isCurrent = rel === 0;
            const dist = Math.abs(rel);
            const opacity = isCurrent ? 1 : Math.max(0.25, 0.55 - dist * 0.15);
            const scale = isCurrent ? 1 : 1 - dist * 0.05;
            return (
              <div
                key={key}
                className="absolute left-0 right-0 px-4 text-center will-change-transform"
                style={{
                  top: "50%",
                  transform: `translate3d(0, calc(-50% + ${rel * SLOT_PX}px), 0) scale(${scale})`,
                  transition:
                    "transform 620ms cubic-bezier(0.22, 0.61, 0.36, 1), opacity 420ms ease-out, filter 420ms ease-out, color 300ms ease-out",
                  fontSize: isCurrent ? 20 : 14,
                  fontWeight: isCurrent ? 800 : 500,
                  letterSpacing: isCurrent ? "0.005em" : 0,
                  color: isCurrent ? "#fff" : `rgba(255,255,255,${opacity})`,
                  opacity,
                  lineHeight: 1.2,
                  textShadow: isCurrent
                    ? "0 2px 18px rgba(0,0,0,0.55), 0 0 22px rgba(255,255,255,0.18)"
                    : undefined,
                  filter: isCurrent ? "none" : `blur(${dist * 0.35}px)`,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {line.text}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


