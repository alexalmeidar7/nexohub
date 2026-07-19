import { useEffect, useMemo, useRef, useState } from "react";
import { Mic } from "lucide-react";
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
}

/**
 * Karaokê inline, discreto, alinhado à esquerda.
 * Busca a letra sincronizada via edge function `fetch-lyrics` sempre que a música mudar.
 * Se não encontrar, exibe uma mensagem amistosa.
 */
export default function InlineKaraoke({ enabled, artist, title, duration, audioElement }: Props) {
  const { user } = useAuth();
  const MUSIC_START_KEY = musicStartKey(user?.id) || "masterview_music_start::__none__";

  const [lines, setLines] = useState<LrcLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [idx, setIdx] = useState(-1);
  const lastKeyRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);

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

  // Sync current line using audio.currentTime, fallback to localStorage start.
  // Aplica offset negativo de 30s para compensar o buffer/latência do streaming
  // — a letra aparece atrasada em relação ao clock da faixa, ficando alinhada
  // com o que o ouvinte está de fato ouvindo pela transmissão.
  const STREAM_LATENCY_SECONDS = 30;
  useEffect(() => {
    if (!enabled || lines.length === 0) return;
    const tick = () => {
      let elapsed: number | null = null;
      if (audioElement && Number.isFinite(audioElement.currentTime) && audioElement.currentTime > 0) {
        elapsed = audioElement.currentTime - STREAM_LATENCY_SECONDS;
      } else {
        const startStr = localStorage.getItem(MUSIC_START_KEY);
        if (startStr) elapsed = (Date.now() - parseInt(startStr, 10)) / 1000 - STREAM_LATENCY_SECONDS;
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
  }, [enabled, lines, audioElement, MUSIC_START_KEY]);

  const upcoming = useMemo(() => {
    const start = Math.max(0, idx);
    return lines.slice(start, start + 4);
  }, [lines, idx]);

  if (!enabled) return null;

  return (
    <div className="mt-4 text-left animate-fade-in" aria-live="polite">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-white/55 mb-2">
        <Mic size={11} /> karaokê
      </div>

      {loading && (
        <div className="text-[12px] text-white/60 italic">buscando letra…</div>
      )}

      {!loading && notFound && (
        <div className="text-[13px] text-white/75 leading-snug italic max-w-[240px]">
          Ihh essa letra eu não aprendi ainda …
        </div>
      )}

      {!loading && !notFound && upcoming.length > 0 && (
        <div className="flex flex-col gap-1 max-w-[260px]">
          {upcoming.map((l, i) => (
            <div
              key={`${l.time}-${i}`}
              className="transition-all duration-500"
              style={{
                fontSize: i === 0 ? 14 : 12,
                fontWeight: i === 0 ? 700 : 400,
                color: i === 0 ? "rgba(255,255,255,0.98)" : `rgba(255,255,255,${0.55 - i * 0.12})`,
                lineHeight: 1.25,
                textShadow: i === 0 ? "0 2px 10px rgba(0,0,0,0.6)" : undefined,
              }}
            >
              {l.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
