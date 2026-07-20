import { useEffect, useMemo, useRef, useState } from "react";
import { Mic, Minus, Plus, RotateCcw, X } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
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

export default function InlineKaraoke({ enabled, artist, title, duration, audioElement, onClose }: Props) {

  const { user } = useAuth();
  const MUSIC_START_KEY = musicStartKey(user?.id) || "masterview_music_start::__none__";

  const [lines, setLines] = useState<LrcLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [idx, setIdx] = useState(-1);
  const [offset, setOffset] = useState<number>(() => {
    try {
      const v = parseFloat(localStorage.getItem(OFFSET_KEY) || "");
      return Number.isFinite(v) ? v : DEFAULT_LATENCY;
    } catch { return DEFAULT_LATENCY; }
  });
  const lastKeyRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    try { localStorage.setItem(OFFSET_KEY, String(offset)); } catch {}
  }, [offset]);

  // Fetch lyrics on song change
  useEffect(() => {
    if (!enabled) return;
    const key = `${artist || ""}||${title || ""}`;
    if (!artist || !title || title === "Sem título") {
      setLines([]); setNotFound(false); setLoading(false); return;
    }
    if (key === lastKeyRef.current) return;
    lastKeyRef.current = key;

    setLines([]); setIdx(-1); setNotFound(false); setLoading(true);
    let cancelled = false;

    supabase.functions.invoke("fetch-lyrics", {
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
      let elapsed: number | null = null;
      if (audioElement && Number.isFinite(audioElement.currentTime) && audioElement.currentTime > 0) {
        elapsed = audioElement.currentTime - offset;
      } else {
        const startStr = localStorage.getItem(MUSIC_START_KEY);
        if (startStr) elapsed = (Date.now() - parseInt(startStr, 10)) / 1000 - offset;
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
  }, [enabled, lines, audioElement, MUSIC_START_KEY, offset]);

  // Show 2 previous, current, 2 upcoming for a rich centered view
  const window5 = useMemo(() => {
    if (lines.length === 0) return [] as { line: LrcLine; rel: number }[];
    const cur = Math.max(0, idx);
    const out: { line: LrcLine; rel: number }[] = [];
    for (let d = -2; d <= 2; d++) {
      const i = cur + d;
      if (i >= 0 && i < lines.length) out.push({ line: lines[i], rel: d });
    }
    return out;
  }, [lines, idx]);

  if (!enabled) return null;

  return (
    <div
      className="mt-3 w-full max-w-[520px] mx-auto animate-fade-in"
      aria-live="polite"
      style={{
        padding: "18px 22px 16px",
        borderRadius: 22,
        background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
        border: "1px solid rgba(255,255,255,0.10)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        boxShadow: "0 20px 60px -30px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.22em] text-white/60">
          <Mic size={11} /> karaokê
        </div>
        {/* Offset adjuster */}
        <div className="flex items-center gap-1 text-white/70" title="Ajuste o atraso da letra para casar com o áudio">
          <button
            onClick={() => setOffset((o) => Math.round((o + 0.5) * 10) / 10)}
            className="w-6 h-6 rounded-full flex items-center justify-center border border-white/15 hover:bg-white/10 transition"
            aria-label="Atrasar letra 0,5s"
            data-focusable
          >
            <Minus size={11} />
          </button>
          <div className="min-w-[54px] text-center text-[10px] tabular-nums text-white/80">
            {offset > 0 ? `+${offset.toFixed(1)}s` : `${offset.toFixed(1)}s`}
          </div>
          <button
            onClick={() => setOffset((o) => Math.round((o - 0.5) * 10) / 10)}
            className="w-6 h-6 rounded-full flex items-center justify-center border border-white/15 hover:bg-white/10 transition"
            aria-label="Adiantar letra 0,5s"
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
        <div className="text-center text-[12px] text-white/60 italic py-6">buscando letra…</div>
      )}

      {!loading && notFound && (
        <div className="text-center text-[13px] text-white/75 leading-snug italic py-6">
          Ihh essa letra eu não aprendi ainda …
        </div>
      )}

      {!loading && !notFound && window5.length > 0 && (
        <div className="flex flex-col items-center justify-center gap-2 text-center" style={{ minHeight: 132 }}>
          {window5.map(({ line, rel }, i) => {
            const isCurrent = rel === 0;
            const dist = Math.abs(rel);
            const opacity = isCurrent ? 1 : Math.max(0.28, 0.6 - dist * 0.18);
            const scale = isCurrent ? 1 : 1 - dist * 0.06;
            return (
              <div
                key={`${line.time}-${i}`}
                className="transition-all duration-500 ease-out w-full"
                style={{
                  fontSize: isCurrent ? 20 : 13,
                  fontWeight: isCurrent ? 800 : 500,
                  letterSpacing: isCurrent ? "0.005em" : 0,
                  color: isCurrent ? "#fff" : `rgba(255,255,255,${opacity})`,
                  lineHeight: 1.25,
                  transform: `scale(${scale})`,
                  textShadow: isCurrent
                    ? "0 2px 18px rgba(0,0,0,0.55), 0 0 22px rgba(255,255,255,0.18)"
                    : undefined,
                  filter: isCurrent ? "none" : `blur(${dist * 0.4}px)`,
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
