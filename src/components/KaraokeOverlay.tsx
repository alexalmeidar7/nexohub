import { useEffect, useState, useRef, useMemo } from "react";
import { Mic, Minus, Plus, Settings, Type } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const MUSIC_START_KEY = "masterview_music_start";
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
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim();
  return raw || "74 92% 70%";
}

// Confetti component
function Confetti({ active }: { active: boolean }) {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; delay: number; size: number; rotation: number; shade: string }>>([]);

  useEffect(() => {
    if (active) {
      const hsl = getAccentHsl();
      const newParticles = Array.from({ length: 60 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.5,
        size: 6 + Math.random() * 10,
        rotation: Math.random() * 360,
        shade: Math.random() > 0.3
          ? `hsl(${hsl})`
          : Math.random() > 0.5
            ? `hsl(${hsl} / 0.7)`
            : `hsl(${hsl} / 0.5)`,
      }));
      setParticles(newParticles);
      const timer = setTimeout(() => setParticles([]), 3500);
      return () => clearTimeout(timer);
    }
  }, [active]);

  if (particles.length === 0) return null;

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {particles.map((p) => {
        const isCircle = Math.random() > 0.5;
        return (
          <div
            key={p.id}
            className="absolute"
            style={{
              left: `${p.x}%`,
              top: "-20px",
              width: p.size,
              height: p.size,
              backgroundColor: p.shade,
              borderRadius: isCircle ? "50%" : "2px",
              animation: `confettiFall 3s ease-out ${p.delay}s forwards`,
              transform: `rotate(${p.rotation}deg)`,
              boxShadow: `0 0 10px ${p.shade}`,
            }}
          />
        );
      })}
      <style>{`
        @keyframes confettiFall {
          0% { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; }
          70% { opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg) scale(0.5); opacity: 0; }
        }
      `}</style>
    </div>
  );
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
  const accentHsl = useMemo(() => getAccentHsl(), []);
  const accent = `hsl(${accentHsl})`;
  const accentA = (a: number) => `hsl(${accentHsl} / ${a})`;

  const [lines, setLines] = useState<LrcLine[]>([]);
  const [currentLineIdx, setCurrentLineIdx] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [exitAnim, setExitAnim] = useState(false);
  const [speedOffset, setSpeedOffset] = useState(-25);
  const [syncMode, setSyncMode] = useState(false);
  const [fontSize, setFontSize] = useState(() => {
    const saved = localStorage.getItem(FONT_SIZE_KEY);
    return saved ? parseFloat(saved) : 1.6;
  });
  const [controlsVisible, setControlsVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const animRef = useRef<number>(0);
  const lastFetchRef = useRef("");
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

  // Fetch lyrics when song changes
  useEffect(() => {
    const key = `${artist}||${title}`;
    if (!artist || !title || title === "Sem título" || key === lastFetchRef.current) return;
    lastFetchRef.current = key;
    setLines([]);
    setCurrentLineIdx(-1);
    setError(false);
    setExitAnim(false);
    setLoading(true);
    setShowConfetti(false);
    setSyncMode(false);

    supabase.functions.invoke("fetch-lyrics", {
      body: { artist, title, duration: duration ? Math.round(duration) : undefined },
    }).then(({ data, error: err }) => {
      setLoading(false);
      if (err || !data?.success || !data?.syncedLyrics) {
        setError(true);
        setTimeout(() => setExitAnim(true), 1500);
        onLyricsNotFound?.();
        return;
      }
      const parsed = parseLrc(data.syncedLyrics);
      if (parsed.length === 0) {
        setError(true);
        setTimeout(() => setExitAnim(true), 1500);
        onLyricsNotFound?.();
        return;
      }
      setLines(parsed);
      setShowConfetti(true);
      onLyricsFound?.();
    });
  }, [artist, title, duration, onLyricsNotFound, onLyricsFound]);

  // Animation loop
  useEffect(() => {
    if (!visible || lines.length === 0) return;

    const tick = () => {
      const startStr = localStorage.getItem(MUSIC_START_KEY);
      if (startStr) {
        const elapsed = (Date.now() - parseInt(startStr, 10)) / 1000 + 3 + speedOffset;

        let idx = -1;
        for (let i = lines.length - 1; i >= 0; i--) {
          if (elapsed >= lines[i].time) {
            idx = i;
            break;
          }
        }
        setCurrentLineIdx(idx);

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
  }, [visible, lines, speedOffset]);

  // Scroll to current line in sync mode
  useEffect(() => {
    if (syncMode && scrollRef.current && currentLineIdx >= 0) {
      const el = scrollRef.current.querySelector(`[data-line-idx="${currentLineIdx}"]`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [syncMode, currentLineIdx]);

  if (!visible) return null;

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
    if (exitAnim) return <Confetti active={showConfetti} />;

    return (
      <>
        <Confetti active={showConfetti} />
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
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <span className="text-white/30 text-xs">Letra não encontrada</span>
          </div>
        </div>
      </>
    );
  }

  // Sync/expanded mode — high z-index, full-screen overlay for reliable clicks
  if (syncMode && lines.length > 0) {
    return (
      <>
        <Confetti active={showConfetti} />
        {/* Full-screen backdrop to capture clicks and prevent pass-through */}
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
              style={{ backgroundColor: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" }}>
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
              style={{ backgroundColor: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" }}>
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
              style={{ backgroundColor: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" }}
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
                        color: isCurrent ? "#ffffff" : "rgba(255,255,255,0.5)",
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
      </>
    );
  }

  // Normal karaoke view
  return (
    <>
      <Confetti active={showConfetti} />
      <div
        className="absolute left-0 right-0 z-[60] flex flex-col items-center animate-fade-in"
        style={{ bottom: controlsVisible ? "180px" : "100px", transition: "bottom 0.4s ease" }}
        onMouseEnter={handleLyricsMouseEnter}
        onMouseLeave={handleLyricsMouseLeave}
      >
        {/* Lyrics — no background */}
        <div className="w-[90vw] max-w-[700px] flex flex-col items-center gap-1 px-4 py-2 pointer-events-auto cursor-default">
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
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{ backgroundColor: accent }}>
            <Mic size={14} className="text-primary-foreground" />
            <span className="text-primary-foreground font-bold text-[11px] tracking-wider uppercase">Karaoke</span>
          </div>

          {/* Speed adjustment */}
          <div className="flex items-center gap-1 px-2 py-1 rounded-full backdrop-blur-md"
            style={{ backgroundColor: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" }}>
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
              style={{ backgroundColor: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" }}
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

function KaraokeLine({ text, progress, active, accentHsl }: { text: string; progress: number; active: boolean; accentHsl: string }) {
  const words = text.split(/\s+/);
  const highlightedCount = active ? Math.ceil(words.length * progress) : 0;
  // The "next" word to sing — show bouncing ball above it
  const ballIdx = active ? highlightedCount : -1;

  return (
    <p className="text-center leading-relaxed transition-all duration-300 relative" style={{ fontSize: active ? "1.6rem" : "1.2rem" }}>
      {words.map((word, i) => {
        const isHighlighted = i < highlightedCount;
        const isBallWord = i === ballIdx && active;
        return (
          <span
            key={i}
            className="inline-block mx-1 transition-all duration-200 relative"
            style={{
              color: active
                ? isHighlighted
                  ? "#ffffff"
                  : "rgba(255,255,255,0.35)"
                : "rgba(255,255,255,0.25)",
              textShadow: isHighlighted
                ? `0 0 20px hsl(${accentHsl} / 0.8), 0 0 40px hsl(${accentHsl} / 0.4)`
                : "none",
              transform: isHighlighted ? "scale(1.05)" : "scale(1)",
              fontWeight: active ? 700 : 500,
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
                  backgroundColor: `hsl(${accentHsl})`,
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
