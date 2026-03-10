import { useEffect, useState, useRef } from "react";
import { Mic, Minus, Plus, Settings } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const MUSIC_START_KEY = "masterview_music_start";
const SPEED_OFFSET_KEY = "karaoke_speed_offset";

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

// Confetti component
function Confetti({ active }: { active: boolean }) {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; delay: number; size: number; rotation: number }>>([]);

  useEffect(() => {
    if (active) {
      const newParticles = Array.from({ length: 60 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        delay: Math.random() * 0.5,
        size: 6 + Math.random() * 10,
        rotation: Math.random() * 360,
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
        const shade = Math.random() > 0.3 ? "#a10a0b" : Math.random() > 0.5 ? "#ff2d2d" : "#ff6b6b";
        return (
          <div
            key={p.id}
            className="absolute"
            style={{
              left: `${p.x}%`,
              top: "-20px",
              width: p.size,
              height: p.size,
              backgroundColor: shade,
              borderRadius: isCircle ? "50%" : "2px",
              animation: `confettiFall 3s ease-out ${p.delay}s forwards`,
              transform: `rotate(${p.rotation}deg)`,
              boxShadow: `0 0 10px ${shade}80`,
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

export default function KaraokeOverlay({ 
  artist, 
  title, 
  audioElement, 
  visible, 
  duration,
  onLyricsNotFound,
  onLyricsFound,
}: KaraokeOverlayProps) {
  const [lines, setLines] = useState<LrcLine[]>([]);
  const [currentLineIdx, setCurrentLineIdx] = useState(-1);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [exitAnim, setExitAnim] = useState(false);
  const [speedOffset, setSpeedOffset] = useState(0);
  const [syncMode, setSyncMode] = useState(false);
  const animRef = useRef<number>(0);
  const lastFetchRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Persist speed offset
  useEffect(() => {
    localStorage.setItem(SPEED_OFFSET_KEY, String(speedOffset));
  }, [speedOffset]);

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
    // Calculate the time difference and adjust offset
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
    if (exitAnim) {
      return <Confetti active={showConfetti} />;
    }

    return (
      <>
        <Confetti active={showConfetti} />
        <div
          className="absolute left-0 right-0 z-[25] flex flex-col items-center pointer-events-none animate-fade-in"
          style={{ bottom: "220px" }}
        >
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full mb-3"
            style={{ backgroundColor: "#a10a0b" }}>
            <Mic size={14} className="text-white" />
            <span className="text-white font-bold text-[11px] tracking-wider uppercase">Karaoke</span>
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

  // Sync/expanded mode
  if (syncMode && lines.length > 0) {
    return (
      <>
        <Confetti active={showConfetti} />
        <div
          className="absolute left-0 right-0 z-[25] flex flex-col items-center pointer-events-auto animate-fade-in"
          style={{ bottom: "155px" }}
        >
          {/* Header */}
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
              style={{ backgroundColor: "#a10a0b" }}>
              <Mic size={14} className="text-white" />
              <span className="text-white font-bold text-[11px] tracking-wider uppercase">Sincronizar</span>
            </div>
            {/* Speed controls */}
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
            {/* Close */}
            <button onClick={() => setSyncMode(false)}
              className="w-7 h-7 rounded-full flex items-center justify-center backdrop-blur-md transition-all hover:bg-white/20 active:scale-95"
              style={{ backgroundColor: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.2)" }}
              title="Fechar">
              <span className="text-white text-xs font-bold">✕</span>
            </button>
          </div>

          {/* Expanded lyrics panel */}
          <div 
            ref={scrollRef}
            className="w-[92vw] max-w-[720px] rounded-2xl backdrop-blur-xl overflow-y-auto"
            style={{ 
              maxHeight: "45vh",
              backgroundColor: "rgba(0,0,0,0.65)",
              boxShadow: "0 12px 48px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.12)"
            }}
          >
            {/* Instruction banner */}
            <div className="sticky top-0 z-10 px-4 py-2.5 text-center backdrop-blur-md"
              style={{ 
                backgroundColor: "rgba(161,10,11,0.25)",
                borderBottom: "1px solid rgba(161,10,11,0.3)"
              }}>
              <span className="text-white/80 text-xs font-medium">
                🎵 Clique na frase que está tocando no momento
              </span>
            </div>

            <div className="px-4 py-3 flex flex-col gap-0.5">
              {lines.map((line, idx) => {
                const isCurrent = idx === currentLineIdx;
                return (
                  <button
                    key={idx}
                    data-line-idx={idx}
                    onClick={() => handleSyncLineClick(idx)}
                    className="text-left px-3 py-2 rounded-xl transition-all duration-200 hover:bg-white/10 active:scale-[0.98]"
                    style={{
                      backgroundColor: isCurrent ? "rgba(161,10,11,0.3)" : "transparent",
                      border: isCurrent ? "1px solid rgba(161,10,11,0.4)" : "1px solid transparent",
                    }}
                  >
                    <span
                      className="text-sm leading-relaxed transition-all duration-200"
                      style={{
                        color: isCurrent ? "#ffffff" : "rgba(255,255,255,0.45)",
                        fontWeight: isCurrent ? 700 : 400,
                        textShadow: isCurrent ? "0 0 15px rgba(161,10,11,0.6)" : "none",
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
        className="absolute left-0 right-0 z-[25] flex flex-col items-center pointer-events-none animate-fade-in"
        style={{ bottom: "220px" }}
      >
        {/* Badge + speed + config button */}
        <div className="flex items-center gap-2 mb-3 pointer-events-auto">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full"
            style={{ backgroundColor: "#a10a0b" }}>
            <Mic size={14} className="text-white" />
            <span className="text-white font-bold text-[11px] tracking-wider uppercase">Karaoke</span>
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

        {/* Lyrics container */}
        <div 
          className="w-[90vw] max-w-[700px] flex flex-col items-center gap-0.5 px-6 py-4 rounded-2xl backdrop-blur-xl"
          style={{ 
            backgroundColor: "rgba(0,0,0,0.5)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.1)"
          }}
        >
          {loading && (
            <span className="text-white/50 text-xs animate-pulse">Buscando letra...</span>
          )}
          {lines.length > 0 && (
            <>
              {line1 && <KaraokeLine text={line1.text} progress={progress} active />}
              {line2 && <KaraokeLine text={line2.text} progress={0} active={false} />}
            </>
          )}
        </div>
      </div>
    </>
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
