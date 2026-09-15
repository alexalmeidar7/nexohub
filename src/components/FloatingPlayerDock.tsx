import { useState, useRef, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, ChevronLeft, ChevronRight, Loader2, Radio } from "lucide-react";
import AutoScrollText from "@/components/player/AutoScrollText";

interface FloatingPlayerDockProps {
  isPlaying: boolean;
  isLoading: boolean;
  isMuted: boolean;
  volume: number;
  channels: any[];
  activeIdx: number;
  currentMusic: { titulo: string; artista: string; capa: string; excecao?: any } | null;
  displayArt: string | null | undefined;
  activeChannel: any;
  onTogglePlay: () => void;
  onToggleMute: () => void;
  onVolume: (v: number) => void;
  onPrev: () => void;
  onNext: () => void;
}

export default function FloatingPlayerDock({
  isPlaying,
  isLoading,
  isMuted,
  volume,
  channels,
  activeIdx,
  currentMusic,
  displayArt,
  activeChannel,
  onTogglePlay,
  onToggleMute,
  onVolume,
  onPrev,
  onNext,
}: FloatingPlayerDockProps) {
  const [hovered, setHovered] = useState(false);
  const [visibleArt, setVisibleArt] = useState(displayArt);
  const [fadingArt, setFadingArt] = useState<string | null>(null);
  const [artOpacity, setArtOpacity] = useState(1);
  const leaveTimer = useRef<number | null>(null);
  const [showControls, setShowControls] = useState(false);

  // Crossfade album art
  useEffect(() => {
    if (displayArt === visibleArt) return;
    setFadingArt(visibleArt || null);
    setArtOpacity(0);
    setVisibleArt(displayArt);
    const raf = requestAnimationFrame(() =>
      requestAnimationFrame(() => setArtOpacity(1))
    );
    const t = setTimeout(() => setFadingArt(null), 800);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [displayArt]);

  // Delayed show/hide so controls don't flicker
  const handleMouseEnter = () => {
    if (leaveTimer.current !== null) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
    setHovered(true);
    setShowControls(true);
  };
  const handleMouseLeave = () => {
    leaveTimer.current = window.setTimeout(() => {
      setHovered(false);
      setShowControls(false);
    }, 200);
  };

  const SIZE = 100; // px — dock square size

  return (
    <div
      className="fixed bottom-6 left-6 z-[200] select-none"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Outer wrapper — expands on hover to show controls below the art */}
      <div
        style={{
          width: showControls ? 220 : SIZE,
          transition: "width 0.35s cubic-bezier(0.4,0,0.2,1)",
          willChange: "width",
        }}
        className="flex flex-col gap-2"
      >
        {/* Album art square */}
        <div
          style={{
            width: SIZE,
            height: SIZE,
            borderRadius: 18,
            overflow: "hidden",
            boxShadow: showControls
              ? "0 20px 60px rgba(0,0,0,0.55), 0 4px 16px rgba(0,0,0,0.4)"
              : "0 8px 28px rgba(0,0,0,0.35), 0 2px 8px rgba(0,0,0,0.25)",
            transition: "box-shadow 0.4s ease, border-radius 0.4s ease, width 0.35s cubic-bezier(0.4,0,0.2,1), height 0.35s cubic-bezier(0.4,0,0.2,1)",
            background: "#001a2e",
            position: "relative",
            flexShrink: 0,
          }}
        >
          {/* Fading out art */}
          {fadingArt && (
            <img
              src={fadingArt}
              alt=""
              style={{
                position: "absolute", inset: 0,
                width: "100%", height: "100%",
                objectFit: "cover",
                opacity: 0,
                transform: "scale(1.06)",
                transition: "opacity 0.8s ease-out, transform 0.8s ease-out",
              }}
            />
          )}
          {/* Visible art */}
          {visibleArt ? (
            <img
              key={visibleArt}
              src={visibleArt}
              alt={currentMusic?.titulo || ""}
              style={{
                position: "absolute", inset: 0,
                width: "100%", height: "100%",
                objectFit: "cover",
                opacity: artOpacity,
                transform: artOpacity ? "scale(1)" : "scale(1.08)",
                transition: "opacity 0.8s cubic-bezier(0.22,0.61,0.36,1), transform 0.8s cubic-bezier(0.22,0.61,0.36,1)",
              }}
            />
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Radio size={32} style={{ color: "rgba(255,255,255,0.15)" }} />
            </div>
          )}

          {/* Subtle vignette */}
          <div
            style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.4) 100%)",
              transition: "opacity 0.3s ease",
              opacity: showControls ? 0.6 : 0.2,
            }}
          />

          {/* Playing indicator dot */}
          {(isPlaying || isLoading) && !showControls && (
            <div style={{
              position: "absolute", bottom: 7, right: 7,
              width: 8, height: 8, borderRadius: "50%",
              background: isLoading ? "rgba(255,255,255,0.5)" : "#0055ff",
              boxShadow: isLoading ? undefined : "0 0 8px #0055ff",
              animation: isLoading ? undefined : "pulse-dot 1.5s ease-in-out infinite",
            }} />
          )}
        </div>

        {/* Controls panel — appears below the art on hover */}
        <div
          style={{
            opacity: showControls ? 1 : 0,
            transform: showControls ? "translateY(0)" : "translateY(8px)",
            transition: "opacity 0.3s ease, transform 0.3s cubic-bezier(0.4,0,0.2,1)",
            pointerEvents: showControls ? "auto" : "none",
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(20px)",
            borderRadius: 14,
            padding: "10px 12px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
            width: 220,
          }}
        >
          {/* Song info */}
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: "#fff", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {currentMusic?.titulo || activeChannel?.nome || "—"}
            </p>
            {currentMusic?.artista && (
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", lineHeight: 1.2, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {currentMusic.artista}
              </p>
            )}
          </div>

          {/* Playback + channel nav row */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* Prev */}
            {channels.length > 1 && (
              <button onClick={onPrev} style={btnStyle} title="Canal anterior">
                <ChevronLeft size={13} style={{ color: "#fff" }} />
              </button>
            )}

            {/* Play/Pause */}
            <button
              onClick={onTogglePlay}
              style={{ ...btnStyle, background: "#0055ff", width: 32, height: 32, boxShadow: "0 2px 10px rgba(0, 85, 255, 0.4)" }}
              title={isLoading ? "Carregando..." : isPlaying ? "Pausar" : "Reproduzir"}
            >
              {isLoading
                ? <Loader2 size={13} className="animate-spin" style={{ color: "#fff" }} />
                : isPlaying
                  ? <Pause size={12} fill="#fff" style={{ color: "#fff" }} />
                  : <Play size={12} fill="#fff" style={{ color: "#fff", marginLeft: 1 }} />
              }
            </button>

            {/* Next */}
            {channels.length > 1 && (
              <button onClick={onNext} style={btnStyle} title="Próximo canal">
                <ChevronRight size={13} style={{ color: "#fff" }} />
              </button>
            )}

            {/* Spacer */}
            <div style={{ flex: 1 }} />

            {/* Mute + Volume */}
            <button onClick={onToggleMute} style={{ ...btnStyle, width: 24, height: 24 }}>
              {isMuted || volume === 0
                ? <VolumeX size={11} style={{ color: "rgba(255,255,255,0.7)" }} />
                : <Volume2 size={11} style={{ color: "rgba(255,255,255,0.7)" }} />
              }
            </button>
            <input
              type="range"
              min={0} max={1} step={0.01}
              value={isMuted ? 0 : volume}
              onChange={e => onVolume(Number(e.target.value))}
              style={{ width: 54, accentColor: "#0055ff", cursor: "pointer" }}
            />
          </div>

          {/* Channel label */}
          {activeChannel?.nome && (
            <p style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", letterSpacing: "0.1em", textTransform: "uppercase", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {activeChannel.nome}
            </p>
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}

const btnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: "none",
  background: "rgba(255,255,255,0.12)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  flexShrink: 0,
  transition: "background 0.15s ease",
};
