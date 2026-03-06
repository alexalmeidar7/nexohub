import { useEffect, useState, useRef } from "react";
import { Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const MUSIC_START_KEY = "masterview_music_start";

interface LrcLine {
  time: number; // seconds
  text: string;
}

interface KaraokeOverlayProps {
  artist: string | null | undefined;
  title: string | null | undefined;
  audioElement: HTMLAudioElement | null | undefined;
  visible: boolean;
  duration?: number;
}

function parseLrc(lrc: string): LrcLine[] {
  const lines: LrcLine[] = [];
  for (const raw of lrc.split("\n")) {
    const match = raw.match(/^\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/);
    if (match) {
      const mins = parseInt(match[1]);
      const secs = parseInt(match[2]);
      const ms = parseInt(match[3].padEnd(3, "0"));
      const time = mins * 60 + secs + ms / 1000;
      const text = match[4].trim();
      if (text) lines.push({ time, text });
    }
  }
  return lines;
}

export default function KaraokeOverlay({ artist, title, audioElement, visible, duration }: KaraokeOverlayProps) {
  const [lines, setLines] = useState<LrcLine[]>([]);
  const [currentLineIdx, setCurrentLineIdx] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const animRef = useRef<number>(0);
  const lastFetchRef = useRef("");

  // Fetch lyrics when song changes
  useEffect(() => {
    const key = `${artist}||${title}`;
    if (!artist || !title || title === "Sem título" || key === lastFetchRef.current) return;
    lastFetchRef.current = key;
    setLines([]);
    setCurrentLineIdx(-1);
    setError(false);
    setLoading(true);

    supabase.functions.invoke("fetch-lyrics", {
      body: { artist, title, duration: duration ? Math.round(duration) : undefined },
    }).then(({ data, error: err }) => {
      setLoading(false);
      if (err || !data?.success || !data?.syncedLyrics) {
        setError(true);
        return;
      }
      const parsed = parseLrc(data.syncedLyrics);
      if (parsed.length === 0) {
        setError(true);
        return;
      }
      setLines(parsed);
    });
  }, [artist, title, duration]);

  // Animation loop: read elapsed from MUSIC_START_KEY (real song start time)
  useEffect(() => {
    if (!visible || lines.length === 0) return;

    const tick = () => {
      const startStr = localStorage.getItem(MUSIC_START_KEY);
      if (startStr) {
        const elapsed = (Date.now() - parseInt(startStr, 10)) / 1000;
        
        // Find current line
        let idx = -1;
        for (let i = lines.length - 1; i >= 0; i--) {
          if (elapsed >= lines[i].time) {
            idx = i;
            break;
          }
        }
        setCurrentLineIdx(idx);

        // Progress within current line
        if (idx >= 0) {
          const lineStart = lines[idx].time;
          const lineEnd = idx + 1 < lines.length ? lines[idx + 1].time : lineStart + 4;
          const p = Math.min(1, Math.max(0, (elapsed - lineStart) / (lineEnd - lineStart)));
          setProgress(p);
        }
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [visible, lines]);

  if (!visible) return null;

  const line1Idx = currentLineIdx >= 0 ? currentLineIdx : 0;
  const line2Idx = line1Idx + 1;
  const line1 = lines[line1Idx];
  const line2 = lines[line2Idx];

  return (
    <div
      className="absolute left-0 right-0 z-[25] flex flex-col items-center pointer-events-none animate-fade-in"
      style={{ bottom: "160px" }}
    >
      {/* Karaoke ON badge */}
      <div className="flex items-center gap-2 mb-8 px-5 py-2.5 rounded-full pointer-events-auto"
        style={{ backgroundColor: "#a10a0b" }}>
        <Mic size={18} className="text-white" />
        <span className="text-white font-bold text-sm tracking-wider uppercase">Karaoke ON</span>
      </div>

      {/* Lyrics container */}
      <div className="w-[90vw] max-w-[700px] flex flex-col items-center gap-3">
        {loading && (
          <span className="text-white/50 text-sm animate-pulse">Buscando letra...</span>
        )}
        {error && !loading && (
          <span className="text-white/30 text-sm">Letra não encontrada</span>
        )}
        {lines.length > 0 && (
          <>
            {line1 && (
              <KaraokeLine text={line1.text} progress={progress} active />
            )}
            {line2 && (
              <KaraokeLine text={line2.text} progress={0} active={false} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function KaraokeLine({ text, progress, active }: { text: string; progress: number; active: boolean }) {
  const words = text.split(/\s+/);
  const highlightedCount = active ? Math.ceil(words.length * progress) : 0;

  return (
    <p className="text-center leading-relaxed transition-all duration-300" style={{ fontSize: active ? "1.6rem" : "1.2rem" }}>
      {words.map((word, i) => {
        const isHighlighted = i < highlightedCount;
        return (
          <span
            key={i}
            className="inline-block mx-1 transition-all duration-200"
            style={{
              color: active
                ? isHighlighted
                  ? "#ffffff"
                  : "rgba(255,255,255,0.35)"
                : "rgba(255,255,255,0.25)",
              textShadow: isHighlighted ? "0 0 20px rgba(161,10,11,0.8), 0 0 40px rgba(161,10,11,0.4)" : "none",
              transform: isHighlighted ? "scale(1.05)" : "scale(1)",
              fontWeight: active ? 700 : 500,
            }}
          >
            {word}
          </span>
        );
      })}
    </p>
  );
}
