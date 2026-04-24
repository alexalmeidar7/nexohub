import { useEffect, useState, useRef, useMemo } from "react";
import { Mic, Minus, Plus, Settings, Type } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { musicStartKey } from "@/lib/musicStorageKeys";

const SPEED_OFFSET_KEY = "karaoke_speed_offset";

interface LrcLine {
  time: number;
  text: string;
}

interface KaraokeOverlayProps {
  artist: string | null | undefined;
  title: string | null | undefined;
  audioElement: HTMLAudioElement | null | undefined;
  visible: boolean;
  duration?: number;
  onLyricsNotFound?: () => void;
  onLyricsFound?: () => void;
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

/** Read the primary accent HSL from CSS variables */
function getAccentHsl(): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--player-accent").trim();
  if (raw) return raw;
  const fallback = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  return fallback || "0 72% 51%";
}

const FONT_SIZE_KEY = "karaoke_font_size";

export default function KaraokeOverlay({
  artist,
  title,
  audioElement,
  visible,
  duration,
  onLyricsNotFound,
  onLyricsFound,
}: KaraokeOverlayProps) {
  const { user } = useAuth();
  const MUSIC_START_KEY = musicStartKey(user?.id) || "masterview_music_start::__none__";
  const accentHsl = useMemo(() => getAccentHsl(), []);
  const accent = `hsl(${accentHsl})`;
  const accentA = (a: number) => `hsl(${accentHsl} / ${a})`;

  const [lines, setLines] = useState<LrcLine[]>([]);
  const [currentLineIdx, setCurrentLineIdx] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [exitAnim, setExitAnim] = useState(false);
  const [songEnded, setSongEnded] = useState(false);
  const [speedOffset, setSpeedOffset] = useState(() => {
    const saved = localStorage.getItem(SPEED_OFFSET_KEY);
    const parsed = saved ? parseFloat(saved) : NaN;
    if (Number.isFinite(parsed)) return Math.max(-30, Math.min(30, parsed));
    return -25;
  });
  const [syncMode, setSyncMode] = useState(false);
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem(FONT_SIZE_KEY);
    return saved ? parseFloat(saved) : 1.6;
  });
  const [controlsVisible, setControlsVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const animRef = useRef<number>(0);
  const lastFetchRef = useRef("");
  const lastElapsedRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persist speed offset & font size
  useEffect(() => {
    localStorage.setItem(SPEED_OFFSET_KEY, String(speedOffset));
  }, [speedOffset]);
  useEffect(() => {
    localStorage.setItem(FONT_SIZE_KEY, String(fontSize));
  }, [fontSize]);

  const handleLyricsMouseEnter = () => {
    clearTimeout(hideTimerRef.current);
    setControlsVisible(true);
  };
  const handleLyricsMouseLeave = () => {
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 1500);
  };

  // Stable refs for callbacks so the fetch effect doesn't rerun on every parent render
  const onLyricsFoundRef = useRef(onLyricsFound);
  const onLyricsNotFoundRef = useRef(onLyricsNotFound);
  useEffect(() => { onLyricsFoundRef.current = onLyricsFound; }, [onLyricsFound]);
  useEffect(() => { onLyricsNotFoundRef.current = onLyricsNotFound; }, [onLyricsNotFound]);

  // Fetch lyrics when song changes
  useEffect(() => {
    const key = `${artist}||${title}`;
    if (!artist || !title || title === "Sem título" || key === lastFetchRef.current) return;
    lastFetchRef.current = key;
    setLines([]);
    setCurrentLineIdx(-1);
    setError(false);
    setExitAnim(false);
    setSongEnded(false);
    setLoading(true);
    setSyncMode(false);
    lastElapsedRef.current = null;

    let cancelled = false;
    const t0 = performance.now();
    const reqId = Math.random().toString(36).slice(2, 8);
    const tag = `[karaoke ${reqId}]`;
    console.info(`${tag} → fetch-lyrics`, { key, duration: duration ? Math.round(duration) : undefined });

    const timeoutWarn = setTimeout(() => {
      if (!cancelled && lastFetchRef.current === key) {
        console.warn(`${tag} ⏱ still pending after 8s`, { key });
      }
    }, 8000);

    supabase.functions.invoke("fetch-lyrics", {
      body: { artist, title, duration: duration ? Math.round(duration) : undefined },
    }).then(({ data, error: err }) => {
      clearTimeout(timeoutWarn);
      const ms = Math.round(performance.now() - t0);
      if (cancelled || lastFetchRef.current !== key) {
        console.info(`${tag} ⊘ stale response ignored`, { key, ms });
        return;
      }
      setLoading(false);
      if (err || !data?.success || !data?.syncedLyrics) {
        console.warn(`${tag} ✗ no lyrics`, { key, ms, status: err ? "invoke_error" : "no_synced", err: err?.message, providerError: data?.error });
        setError(true);
        setTimeout(() => { if (lastFetchRef.current === key) setExitAnim(true); }, 1500);
        onLyricsNotFoundRef.current?.();
        return;
      }
      const parsed = parseLrc(data.syncedLyrics);
      if (parsed.length === 0) {
        console.warn(`${tag} ✗ empty parse`, { key, ms, lrcLength: data.syncedLyrics?.length });
        setError(true);
        setTimeout(() => { if (lastFetchRef.current === key) setExitAnim(true); }, 1500);
        onLyricsNotFoundRef.current?.();
        return;
      }
      console.info(`${tag} ✓ ok`, { key, ms, lines: parsed.length, source: data?.source });
      setLines(parsed);
      onLyricsFoundRef.current?.();
    }).catch((e) => {
      clearTimeout(timeoutWarn);
      const ms = Math.round(performance.now() - t0);
      if (cancelled || lastFetchRef.current !== key) return;
      console.error(`${tag} ✗ exception`, { key, ms, message: e?.message });
      setLoading(false);
      setError(true);
      setTimeout(() => { if (lastFetchRef.current === key) setExitAnim(true); }, 1500);
      onLyricsNotFoundRef.current?.();
    });

    return () => { cancelled = true; clearTimeout(timeoutWarn); };
  }, [artist, title, duration]);

  // Animation loop
  useEffect(() => {
    if (!visible || lines.length === 0) return;

    const tick = () => {
      const expectedMaxTime = duration && duration > 0
        ? duration
        : (lines[lines.length - 1]?.time ?? 0) + 8;

      const isPlausible = (value: number | null) => (
        value !== null
        && Number.isFinite(value)
        && value >= -20
        && value <= expectedMaxTime + 20
      );

      const startStr = localStorage.getItem(MUSIC_START_KEY);
      const storageElapsed = startStr
        ? ((Date.now() - parseInt(startStr, 10)) / 1000 + 3 + speedOffset)
        : null;

      const mediaElapsed = audioElement && Number.isFinite(audioElement.currentTime)
        ? audioElement.currentTime + speedOffset
        : null;

      const storageOk = isPlausible(storageElapsed);
      const mediaOk = isPlausible(mediaElapsed);

      let elapsed: number | null = null;

      if (storageOk) elapsed = storageElapsed;
      else if (mediaOk) elapsed = mediaElapsed;

      if (storageOk && mediaOk && lastElapsedRef.current !== null) {
        const distanceToStorage = Math.abs(storageElapsed! - lastElapsedRef.current);
        const distanceToMedia = Math.abs(mediaElapsed! - lastElapsedRef.current);
        if (distanceToMedia + 0.35 < distanceToStorage) {
          elapsed = mediaElapsed;
        }
      }

      if (elapsed === null) {
        animRef.current = requestAnimationFrame(tick);
        return;
      }

      lastElapsedRef.current = elapsed;

      let idx = -1;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (elapsed >= lines[i].time) {
          idx = i;
          break;
        }
      }

      setCurrentLineIdx(idx);

      const lastLineTime = lines[lines.length - 1]?.time ?? 0;
      const endBuffer = 8;
      if (elapsed > lastLineTime + endBuffer && idx === lines.length - 1) {
        setSongEnded(true);
      } else {
        setSongEnded(false);
      }

      if (idx >= 0) {
        const lineStart = lines[idx].time;
        const lineEnd = idx + 1 < lines.length ? lines[idx + 1].time : lineStart + 4;
        const p = Math.min(1, Math.max(0, (elapsed - lineStart) / (lineEnd - lineStart)));
        setProgress(p);
      } else {
        setProgress(0);
      }

      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [visible, lines, speedOffset]);

  // Scroll to current line in sync mode
  useEffect(() => {
    if (syncMode && scrollRef.current && currentLineIdx >= 0) {
      const el = scrollRef.current.querySelector(`[data-line-idx="${currentLineIdx}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [syncMode, currentLineIdx]);

  if (!visible) return null;
  if (songEnded && !loading) return null;

  const line1Idx = currentLineIdx >= 0 ? currentLineIdx : 0;
  const line2Idx = line1Idx + 1;
  const line1 = lines[line1Idx];
  const line2 = lines[line2Idx];

  const adjustSpeed = (delta: number) => {
    setSpeedOffset(prev => Math.max(-30, Math.min(30, prev + delta)));
  };

  const handleSyncLineClick = (idx: number) => {
    const startStr = localStorage.getItem(MUSIC_START_KEY);
    if (startStr && lines[idx]) {
      const elapsed = (Date.now() - parseInt(startStr, 10)) / 1000 + 3;
      const targetTime = lines[idx].time;
      const newOffset = targetTime - elapsed;
      setSpeedOffset(Math.round(newOffset));
    }
    setSyncMode(false);
  };

  // Error state
  if (error && !loading) {
    if (exitAnim) return null;

    return (
      <div
        className="absolute left-0 right-0 z-[60] flex flex-col items-center pointer-events-none animate-fade-in"
        style={{ bottom: "220px" }}
      >
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full mb-3"
          style={{ backgroundColor: accent }}>
          <Mic size={14} className="text-primary-foreground" />
          <span className="text-primary-foreground font-bold text-[11px] tracking-wider uppercase">Karaoke</span>
        </div>
        <div
          className="px-6 py-4 rounded-2xl backdrop-blur-xl transition-all duration-700"
          style={{
            backgroundColor: "rgba(0,0,0,0.5)",
            border: `1px solid ${accentA(0.15)}`,
          }}
        >
          <span className="text-white/30 text-xs">Letra não encontrada</span>
        </div>
      </div>
    );
  }

  // Sync/expanded mode
  if (syncMode && lines.length > 0) {
    return (
      <div
        className="fixed inset-0 z-[90] flex flex-col items-center justify-center"
        style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        onClick={(e) => { if (e.target === e.currentTarget) setSyncMode(false); }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-3 flex-wrap justify-center">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{ backgroundColor: accent }}>
            <Mic size={14} className="text-primary-foreground" />
            <span className="text-primary-foreground font-bold text-[11px] tracking-wider uppercase">Sincronizar</span>
          </div>
          {/* Speed controls */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-full backdrop-blur-md"
            style={{ backgroundColor: accentA(0.15), border: `1px solid ${accentA(0.25)}` }}>
            <button onClick={() => adjustSpeed(-5)}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:bg-white/20 active:scale-95"
              title="Atrasar 5s">
              <Minus size={14} className="text-white" />
            </button>
            <span className="text-white text-[11px] font-bold min-w-[36px] text-center tabular-nums">
              {speedOffset > 0 ? "+" : ""}{speedOffset}s
            </span>
            <button onClick={() => adjustSpeed(5)}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:bg-white/20 active:scale-95"
              title="Adiantar 5s">
              <Plus size={14} className="text-white" />
            </button>
          </div>
          {/* Font size controls */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-full backdrop-blur-md"
            style={{ backgroundColor: accentA(0.15), border: `1px solid ${accentA(0.25)}` }}>
            <Type size={13} className="text-white mr-0.5" />
            <button onClick={() => setFontSize(prev => Math.max(1, prev - 0.2))}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:bg-white/20 active:scale-95"
              title="Diminuir fonte">
              <Minus size={14} className="text-white" />
            </button>
            <span className="text-white text-[11px] font-bold min-w-[28px] text-center tabular-nums">
              {fontSize.toFixed(1)}
            </span>
            <button onClick={() => setFontSize(prev => Math.min(3, prev + 0.2))}
              className="w-7 h-7 rounded-full flex items-center justify-center transition-all hover:bg-white/20 active:scale-95"
              title="Aumentar fonte">
              <Plus size={14} className="text-white" />
            </button>
          </div>
          {/* Close */}
          <button onClick={() => setSyncMode(false)}
            className="w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md transition-all hover:bg-white/20 active:scale-95"
            style={{ backgroundColor: accentA(0.15), border: `1px solid ${accentA(0.25)}` }}
            title="Fechar">
            <span className="text-white text-sm font-bold">✕</span>
          </button>
        </div>

        {/* Expanded lyrics panel */}
        <div
          ref={scrollRef}
          className="w-[92vw] max-w-[720px] rounded-2xl backdrop-blur-xl overflow-y-auto"
          style={{
            maxHeight: "60vh",
            backgroundColor: "rgba(0,0,0,0.75)",
            boxShadow: `0 12px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1), 0 0 60px ${accentA(0.15)}`,
            border: `1px solid ${accentA(0.2)}`
          }}
        >
          {/* Instruction banner */}
          <div className="sticky top-0 z-10 px-4 py-3 text-center backdrop-blur-md"
            style={{
              backgroundColor: accentA(0.2),
              borderBottom: `1px solid ${accentA(0.3)}`
            }}>
            <span className="text-white/90 text-sm font-medium">
              🎵 Clique na frase que está tocando agora
            </span>
          </div>

          <div className="px-3 py-3 flex flex-col gap-0.5">
            {lines.map((line, idx) => {
              const isCurrent = idx === currentLineIdx;
              return (
                <button
                  key={idx}
                  data-line-idx={idx}
                  onClick={(e) => { e.stopPropagation(); handleSyncLineClick(idx); }}
                  className="text-left px-4 py-3 rounded-xl transition-all duration-200 hover:bg-white/15 active:scale-[0.98] cursor-pointer select-none"
                  style={{
                    backgroundColor: isCurrent ? accentA(0.25) : "transparent",
                    border: isCurrent ? `1px solid ${accentA(0.4)}` : "1px solid transparent",
                  }}
                >
                  <span
                    className="text-base leading-relaxed transition-all duration-200"
                    style={{
                      color: isCurrent ? accent : "rgba(255,255,255,0.5)",
                      fontWeight: isCurrent ? 700 : 400,
                      textShadow: isCurrent ? `0 0 15px ${accentA(0.6)}` : "none",
                    }}
                  >
                    {line.text}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Normal karaoke view
  return (
    <>
      <div
        className="absolute left-0 right-0 z-[60] flex flex-col items-center animate-fade-in"
        style={{ bottom: controlsVisible ? "100px" : "10px", transition: "bottom 0.4s ease" }}
        onMouseEnter={handleLyricsMouseEnter}
        onMouseLeave={handleLyricsMouseLeave}
        onWheel={(e) => {
          e.preventDefault();
          e.stopPropagation();
          adjustSpeed(e.deltaY > 0 ? -1 : 1);
        }}
      >
        {/* Lyrics */}
        <div className="w-[94vw] sm:w-[90vw] max-w-[700px] flex flex-col items-center gap-1 sm:gap-1.5 px-3 sm:px-6 py-2 sm:py-3 pointer-events-auto cursor-default rounded-2xl">
          {loading && (
            <span className="text-white/50 text-xs animate-pulse">Buscando letra...</span>
          )}
          {lines.length > 0 && (
            <>
              {line1 && <KaraokeLine text={line1.text} progress={progress} active accentHsl={accentHsl} fontSize={fontSize} />}
              {line2 && <KaraokeLine text={line2.text} progress={0} active={false} accentHsl={accentHsl} fontSize={fontSize} />}
            </>
          )}
        </div>

        {/* Controls below lyrics — show on hover */}
        <div
          className="flex items-center gap-2 mt-3 pointer-events-auto transition-all duration-300"
          style={{ opacity: controlsVisible ? 1 : 0, transform: controlsVisible ? "translateY(0)" : "translateY(8px)", pointerEvents: controlsVisible ? "auto" : "none" }}
        >
          {/* Speed adjustment */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-full backdrop-blur-md"
            style={{ backgroundColor: accentA(0.15), border: `1px solid ${accentA(0.25)}` }}>
            <button onClick={() => adjustSpeed(-5)}
              className="w-6 h-6 rounded-full flex items-center justify-center transition-all hover:bg-white/20 active:scale-95"
              title="Atrasar 5s">
              <Minus size={12} className="text-white" />
            </button>
            <span className="text-white text-[10px] font-bold min-w-[32px] text-center tabular-nums">
              {speedOffset > 0 ? "+" : ""}{speedOffset}s
            </span>
            <button onClick={() => adjustSpeed(5)}
              className="w-6 h-6 rounded-full flex items-center justify-center transition-all hover:bg-white/20 active:scale-95"
              title="Adiantar 5s">
              <Plus size={12} className="text-white" />
            </button>
          </div>

          {/* Config/sync button */}
          {lines.length > 0 && (
            <button
              onClick={() => setSyncMode(true)}
              className="w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-md transition-all hover:bg-white/20 active:scale-95"
              style={{ backgroundColor: accentA(0.15), border: `1px solid ${accentA(0.25)}` }}
              title="Sincronizar letra"
            >
              <Settings size={13} className="text-white" />
            </button>
          )}
        </div>
      </div>

      {/* Bouncing ball keyframes */}
      <style>{`
        @keyframes karaokeBounce {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
      `}</style>
    </>
  );
}

function KaraokeLine({ text, progress, active, accentHsl, fontSize = 1.6 }: { text: string; progress: number; active: boolean; accentHsl: string; fontSize?: number }) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;
  const mobileFactor = isMobile ? 0.65 : 1;
  const effectiveSize = fontSize * mobileFactor;
  const words = text.split(/\s+/);
  const highlightedCount = active ? Math.ceil(words.length * progress) : 0;
  const ballIdx = active ? highlightedCount : -1;
  const accent = `hsl(${accentHsl})`;

  return (
    <p className="text-center leading-snug transition-all duration-300 relative" style={{ fontSize: active ? `${effectiveSize}rem` : `${effectiveSize * 0.7}rem`, letterSpacing: "-0.01em" }}>
      {words.map((word, i) => {
        const isHighlighted = i < highlightedCount;
        const isBallWord = i === ballIdx && active;
        return (
          <span
            key={i}
            className="inline-block mx-[3px] transition-all duration-200 relative"
            style={{
              color: active
                ? isHighlighted
                  ? accent
                  : "rgba(255,255,255,0.35)"
                : "rgba(255,255,255,0.25)",
              textShadow: isHighlighted
                ? `0 1px 3px rgba(0,0,0,0.8), 0 0 20px hsl(${accentHsl} / 0.5), 0 0 40px hsl(${accentHsl} / 0.2)`
                : active ? "0 1px 4px rgba(0,0,0,0.7)" : "0 1px 3px rgba(0,0,0,0.5)",
              transform: isHighlighted ? "scale(1.04)" : "scale(1)",
              fontWeight: active ? 800 : 500,
            }}
          >
            {/* Bouncing ball */}
            {isBallWord && (
              <span
                className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
                style={{
                  top: "-18px",
                  width: 10,
                  height: 10,
                  borderRadius: "50%",
                  backgroundColor: accent,
                  boxShadow: `0 0 12px hsl(${accentHsl} / 0.7), 0 0 24px hsl(${accentHsl} / 0.3)`,
                  animation: "karaokeBounce 0.5s ease-in-out infinite",
                }}
              />
            )}
            {word}
          </span>
        );
      })}
    </p>
  );
}
