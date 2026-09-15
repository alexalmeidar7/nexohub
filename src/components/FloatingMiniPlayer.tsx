import { useState, useEffect, useRef, useCallback } from "react";
import { Play, Pause, Volume2, VolumeX, ChevronLeft, ChevronRight, Loader2, Radio } from "lucide-react";
import { useAlbumColors } from "@/hooks/useAlbumColors";
import { readMusicData, MUSIC_DATA_EVENT } from "@/lib/musicStorageKeys";
import { getStationDatabaseSync } from "@/lib/stationDatabaseService";

interface MusicState {
  displayArt: string | null;
  currentMusic: { titulo: string; artista: string; capa: string; excecao?: any } | null;
  channels: any[];
  activeIdx: number;
  activeChannel: any;
  isPlaying: boolean;
  isLoading: boolean;
  isMuted: boolean;
  volume: number;
}

const INITIAL: MusicState = {
  displayArt: null,
  currentMusic: null,
  channels: [],
  activeIdx: 0,
  activeChannel: null,
  isPlaying: false,
  isLoading: false,
  isMuted: false,
  volume: 0.8,
};

interface DisplayedMusicInfo {
  titulo: string;
  artista: string;
  art: string | null;
}

type AnimPhase = "idle" | "exiting" | "entering-prep";

export interface FloatingMiniPlayerProps {
  isBehindPages?: boolean;
  effectiveUserId?: string | null;
}

export default function FloatingMiniPlayer({ isBehindPages = false, effectiveUserId }: FloatingMiniPlayerProps) {
  const [state, setState] = useState<MusicState>(() => {
    return (window as any)?.__lastPlayerMusicState || INITIAL;
  });
  const [showControls, setShowControls] = useState(false);
  const autoHideTimer = useRef<number | null>(null);

  // Fallback and listener for continuous updates across all pages
  useEffect(() => {
    if ((window as any)?.__lastPlayerMusicState) {
      setState((window as any).__lastPlayerMusicState as MusicState);
    }
    const onMusic = (e: Event) => {
      const d = (e as CustomEvent).detail;
      if (d) setState(d as MusicState);
    };
    window.addEventListener("player:music", onMusic as EventListener);

    const onStorage = () => {
      if (effectiveUserId) {
        try {
          const d = readMusicData(effectiveUserId) as any;
          if (d && (d.titulo || d.excecao)) {
            setState(prev => ({
              ...prev,
              currentMusic: {
                titulo: d.titulo || "",
                artista: d.artista || "",
                capa: d.capa || "",
                excecao: d.excecao || null,
              },
              displayArt: d.capa || prev.displayArt,
            }));
          }
        } catch {}
      }
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(MUSIC_DATA_EVENT, onStorage as EventListener);

    return () => {
      window.removeEventListener("player:music", onMusic as EventListener);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(MUSIC_DATA_EVENT, onStorage as EventListener);
    };
  }, [effectiveUserId]);

  // Track info resolution for smooth entrance / exit animation
  const targetTitulo = (state.currentMusic?.titulo || state.activeChannel?.nome || "").trim();
  const targetArtista = (state.currentMusic?.artista || (state.activeChannel?.nome ? "Ao vivo" : "")).trim();
  const targetArt = state.displayArt || state.currentMusic?.capa || null;
  const currentKey = `${targetTitulo}:::${targetArtista}:::${targetArt}`;

  const [displayedInfo, setDisplayedInfo] = useState<DisplayedMusicInfo>(() => ({
    titulo: targetTitulo,
    artista: targetArtista,
    art: targetArt,
  }));
  const [animPhase, setAnimPhase] = useState<AnimPhase>("idle");

  const lastKeyRef = useRef<string>(currentKey);
  const animTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  // Synchronized entrance and exit animations for: imagem da capa, nome da música e nome do artista
  useEffect(() => {
    if (!lastKeyRef.current || lastKeyRef.current === ":::::null" || lastKeyRef.current === ":::") {
      lastKeyRef.current = currentKey;
      setDisplayedInfo({
        titulo: targetTitulo,
        artista: targetArtista,
        art: targetArt,
      });
      return;
    }

    if (lastKeyRef.current !== currentKey) {
      lastKeyRef.current = currentKey;

      if (animTimerRef.current) clearTimeout(animTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      // 1. Exit animation: old cover scales down/fades, text slides up/fades
      setAnimPhase("exiting");

      animTimerRef.current = window.setTimeout(() => {
        // 2. Prepare new content while opacity is 0
        setDisplayedInfo({
          titulo: targetTitulo,
          artista: targetArtista,
          art: targetArt,
        });
        setAnimPhase("entering-prep");

        // 3. Entrance animation: slide up into position and scale into place
        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = requestAnimationFrame(() => {
            setAnimPhase("idle");
          });
        });
      }, 220);
    }
  }, [currentKey, targetTitulo, targetArtista, targetArt]);

  useEffect(() => {
    return () => {
      if (animTimerRef.current) clearTimeout(animTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const colors = useAlbumColors(displayedInfo.art || state.displayArt);

  // Auto-hide inactivity timer management
  const resetAutoHide = useCallback((delay = 3500) => {
    if (autoHideTimer.current !== null) {
      window.clearTimeout(autoHideTimer.current);
    }
    autoHideTimer.current = window.setTimeout(() => {
      setShowControls(false);
      autoHideTimer.current = null;
    }, delay);
  }, []);

  // Trigger controls on cover hover
  const handleCoverMouseEnter = useCallback(() => {
    setShowControls(true);
    resetAutoHide(4000);
  }, [resetAutoHide]);

  // Cover click: toggle play and show controls
  const handleCoverClick = useCallback(() => {
    dispatch("player:toggle");
    setShowControls(true);
    resetAutoHide(4000);
  }, [resetAutoHide]);

  // Keep controls visible while interacting with player or buttons
  const handlePlayerInteraction = useCallback(() => {
    setShowControls(true);
    resetAutoHide(4000);
  }, [resetAutoHide]);

  // When mouse leaves the player widget, smoothly collapse controls after short grace period
  const handlePlayerMouseLeave = useCallback(() => {
    if (autoHideTimer.current !== null) {
      window.clearTimeout(autoHideTimer.current);
    }
    autoHideTimer.current = window.setTimeout(() => {
      setShowControls(false);
      autoHideTimer.current = null;
    }, 1200);
  }, []);

  useEffect(() => {
    return () => {
      if (autoHideTimer.current !== null) {
        window.clearTimeout(autoHideTimer.current);
      }
    };
  }, []);

  const dispatch = (name: string, detail?: object) =>
    window.dispatchEvent(new CustomEvent(name, detail ? { detail } : undefined));

  const { isPlaying, isLoading, isMuted, volume, channels, activeChannel, currentMusic } = state;
  const syncChannels = channels.length > 0 ? channels : (getStationDatabaseSync(effectiveUserId)?.channels || []);
  const effectiveChannels = syncChannels.length > 0 ? syncChannels : [{ id: "main", nome: "Ao Vivo" }];

  const hasTrackInfo = !!(displayedInfo.titulo || currentMusic?.titulo || activeChannel?.nome || syncChannels.length > 0);

  // Don't render only if absolutely no channel and no music info
  if (channels.length === 0 && !hasTrackInfo && !displayedInfo.art && !displayedInfo.titulo) return null;

  // Animation styles based on phase:
  // "idle": fully visible at resting position
  // "exiting": cover scales down/blurs/fades out; title and artist float upward/fade out
  // "entering-prep": pre-positioned below resting position and slightly oversized with 0 opacity
  const coverAnimStyle: React.CSSProperties =
    animPhase === "exiting"
      ? {
          opacity: 0,
          transform: "scale(0.9) rotate(-1.5deg)",
          filter: "blur(3px)",
          transition: "transform 0.22s cubic-bezier(0.4, 0, 1, 1), opacity 0.2s ease, filter 0.2s ease",
        }
      : animPhase === "entering-prep"
      ? {
          opacity: 0,
          transform: "scale(1.08) rotate(1.5deg)",
          filter: "blur(3px)",
          transition: "none",
        }
      : {
          opacity: 1,
          transform: "scale(1) rotate(0deg)",
          filter: "blur(0px)",
          transition: "transform 0.42s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.35s ease, filter 0.35s ease",
        };

  const titleAnimStyle: React.CSSProperties =
    animPhase === "exiting"
      ? {
          opacity: 0,
          transform: "translateY(-8px)",
          transition: "transform 0.22s cubic-bezier(0.4, 0, 1, 1), opacity 0.2s ease",
        }
      : animPhase === "entering-prep"
      ? {
          opacity: 0,
          transform: "translateY(10px)",
          transition: "none",
        }
      : {
          opacity: 1,
          transform: "translateY(0)",
          transition: "transform 0.38s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.32s ease",
        };

  const artistAnimStyle: React.CSSProperties =
    animPhase === "exiting"
      ? {
          opacity: 0,
          transform: "translateY(-6px)",
          transition: "transform 0.22s cubic-bezier(0.4, 0, 1, 1), opacity 0.2s ease",
        }
      : animPhase === "entering-prep"
      ? {
          opacity: 0,
          transform: "translateY(8px)",
          transition: "none",
        }
      : {
          opacity: 1,
          transform: "translateY(0)",
          transition: "transform 0.38s cubic-bezier(0.16, 1, 0.3, 1) 0.05s, opacity 0.32s ease 0.05s",
        };

  return (
    <div
      data-floating-player
      className={`fixed bottom-6 left-0 right-0 select-none ${
        isBehindPages
          ? "z-[2] pointer-events-none opacity-0 invisible"
          : "z-30 pointer-events-none opacity-100 visible"
      }`}
      style={{
        transition: "z-index 0.2s ease, opacity 0.25s ease, visibility 0.25s ease",
      }}
    >
      <div className="max-w-[1600px] mx-auto px-4 lg:px-8 w-full flex items-center justify-start pointer-events-none">
        <div
          className={`${isBehindPages ? "pointer-events-none" : "pointer-events-auto"} flex items-center gap-3.5 relative`}
          onMouseLeave={handlePlayerMouseLeave}
          style={{ userSelect: "none" }}
        >
          {/* Album art square (100x100px) — Hovering reveals player controls */}
          <div
            style={{
              width: 100,
              height: 100,
              borderRadius: 20,
              overflow: "hidden",
              position: "relative",
              flexShrink: 0,
              background: "#001420",
              boxShadow: showControls
                ? `0 24px 64px rgba(0,0,0,0.65), 0 0 32px ${colors[0]}40`
                : `0 10px 30px rgba(0,0,0,0.45), 0 0 18px ${colors[0]}26`,
              transition: "box-shadow 0.45s ease, transform 0.3s ease",
              cursor: "pointer",
            }}
            className="hover:scale-[1.02] active:scale-95 group"
            onMouseEnter={handleCoverMouseEnter}
            onMouseMove={handlePlayerInteraction}
            onClick={handleCoverClick}
            title={isPlaying ? "Clique para pausar" : "Clique para reproduzir"}
          >
            {/* Displayed album art with smooth scale & blur enter/exit animations */}
            {displayedInfo.art ? (
              <img
                key={displayedInfo.art}
                src={displayedInfo.art}
                alt={displayedInfo.titulo || ""}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  ...coverAnimStyle,
                }}
              />
            ) : (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  ...coverAnimStyle,
                }}
              >
                <Radio size={28} style={{ color: "rgba(255,255,255,0.18)" }} />
              </div>
            )}

            {/* Vignette overlay */}
            <div style={{
              position: "absolute", inset: 0,
              background: "linear-gradient(180deg, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.55) 100%)",
              opacity: showControls ? 0.7 : 0.3,
              transition: "opacity 0.4s ease",
            }} />

            {/* Live indicator dot on bottom right of the cover */}
            {(isPlaying || isLoading) && (
              <div style={{
                position: "absolute", bottom: 8, right: 8,
                width: 7, height: 7, borderRadius: "50%",
                background: isLoading ? "rgba(255,255,255,0.5)" : (colors[0] || "#0055ff"),
                boxShadow: isLoading ? undefined : `0 0 10px ${colors[0] || "#0055ff"}`,
                animation: isLoading ? undefined : "fmp-pulse 1.8s ease-in-out infinite",
              }} />
            )}
          </div>

          {/* Panel on the RIGHT SIDE of the album art: Music Info + Auto-hiding Playback Controls */}
          {hasTrackInfo && (
            <div
              onMouseEnter={handlePlayerInteraction}
              onMouseMove={handlePlayerInteraction}
              onClick={handlePlayerInteraction}
              style={{
                opacity: 1,
                transform: "translateX(0) scale(1)",
                transformOrigin: "left center",
                transition: "background 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease, padding 0.3s ease, min-width 0.3s ease",
                pointerEvents: "auto",
                background: showControls
                  ? `linear-gradient(135deg, ${colors[0]}33 0%, rgba(5, 9, 18, 0.95) 100%)`
                  : "transparent",
                backdropFilter: showControls ? "blur(24px) saturate(1.5)" : "none",
                WebkitBackdropFilter: showControls ? "blur(24px) saturate(1.5)" : "none",
                borderRadius: 20,
                padding: showControls ? "12px 18px" : "4px 8px",
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                minWidth: showControls ? 250 : "auto",
                maxWidth: "min(340px, calc(100vw - 140px))",
                border: showControls ? `1px solid ${colors[0]}40` : "1px solid transparent",
                boxShadow: showControls
                  ? `0 16px 40px rgba(0,0,0,0.55), 0 0 24px ${colors[0]}20, inset 0 1px 0 rgba(255,255,255,0.12)`
                  : "none",
                cursor: showControls ? "default" : "pointer",
              }}
            >
              {/* Music info: Title and Artist with smooth entrance and exit animations */}
              <div style={{ minWidth: 0, overflow: "hidden" }}>
                <p
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                    color: "#ffffff",
                    lineHeight: 1.2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    margin: 0,
                    letterSpacing: "-0.01em",
                    textTransform: "uppercase",
                    textShadow: showControls ? "none" : "0 2px 8px rgba(0,0,0,0.85), 0 1px 3px rgba(0,0,0,0.9)",
                    ...titleAnimStyle,
                  }}
                  title={displayedInfo.titulo || state.activeChannel?.nome || ""}
                >
                  {displayedInfo.titulo || state.activeChannel?.nome || "Sem reprodução"}
                </p>
                {(displayedInfo.artista || state.activeChannel?.nome) && (
                  <p
                    style={{
                      fontSize: 12,
                      fontWeight: 500,
                      color: showControls ? "rgba(255,255,255,0.65)" : "rgba(255,255,255,0.75)",
                      lineHeight: 1.25,
                      margin: "3px 0 0",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      textTransform: "uppercase",
                      letterSpacing: "0.03em",
                      textShadow: showControls ? "none" : "0 2px 6px rgba(0,0,0,0.85)",
                      ...artistAnimStyle,
                    }}
                    title={displayedInfo.artista || ""}
                  >
                    {displayedInfo.artista || (state.activeChannel?.nome ? "Ao vivo" : "")}
                  </p>
                )}
              </div>

              {/* Playback Controls — hides when not interacting, smoothly expands on hover/interaction */}
              <div
                style={{
                  maxHeight: showControls ? 38 : 0,
                  opacity: showControls ? 1 : 0,
                  marginTop: showControls ? 8 : 0,
                  transform: showControls ? "translateY(0)" : "translateY(4px)",
                  pointerEvents: showControls ? "auto" : "none",
                  overflow: "hidden",
                  transition: "max-height 0.32s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.25s ease, margin-top 0.32s ease, transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
                  display: "flex",
                  alignItems: "center",
                  gap: 7,
                }}
                onMouseEnter={handlePlayerInteraction}
                onMouseMove={handlePlayerInteraction}
              >
                {channels.length > 1 && (
                  <button
                    onClick={() => { dispatch("player:prev"); handlePlayerInteraction(); }}
                    style={ctrlBtn}
                    title="Canal anterior"
                  >
                    <ChevronLeft size={13} style={{ color: "rgba(255,255,255,0.8)" }} />
                  </button>
                )}

                <button
                  onClick={() => { dispatch("player:toggle"); handlePlayerInteraction(); }}
                  style={{
                    ...playBtn,
                    background: colors[0] || "#0055ff",
                    boxShadow: `0 2px 12px ${(colors[0] || "#0055ff")}66`,
                  }}
                  title={isLoading ? "Carregando..." : isPlaying ? "Pausar" : "Reproduzir"}
                >
                  {isLoading
                    ? <Loader2 size={13} className="animate-spin text-white" />
                    : isPlaying
                      ? <Pause size={12} fill="#fff" className="text-white" />
                      : <Play size={12} fill="#fff" className="text-white" style={{ marginLeft: 1 }} />
                  }
                </button>

                {channels.length > 1 && (
                  <button
                    onClick={() => { dispatch("player:next"); handlePlayerInteraction(); }}
                    style={ctrlBtn}
                    title="Próximo canal"
                  >
                    <ChevronRight size={13} style={{ color: "rgba(255,255,255,0.8)" }} />
                  </button>
                )}

                <div style={{ width: 4 }} />

                <button
                  onClick={() => {
                    dispatch("player:volume", { volume: isMuted || volume === 0 ? 0.8 : 0 });
                    handlePlayerInteraction();
                  }}
                  style={ctrlBtn}
                  title={isMuted ? "Ativar som" : "Mutar"}
                >
                  {isMuted || volume === 0
                    ? <VolumeX size={12} style={{ color: "rgba(255,255,255,0.65)" }} />
                    : <Volume2 size={12} style={{ color: "rgba(255,255,255,0.65)" }} />
                  }
                </button>

                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={isMuted ? 0 : volume}
                  onChange={e => {
                    dispatch("player:volume", { volume: Number(e.target.value) });
                    handlePlayerInteraction();
                  }}
                  onInput={handlePlayerInteraction}
                  className="fmp-volume-slider"
                  style={{
                    width: 50,
                    cursor: "pointer",
                    background: `linear-gradient(to right, ${colors[0] || "#0055ff"} ${(isMuted ? 0 : volume) * 100}%, rgba(255,255,255,0.18) ${(isMuted ? 0 : volume) * 100}%)`,
                  }}
                />
              </div>

              {/* Channel badge if active and distinct from music title */}
              {activeChannel?.nome && currentMusic?.titulo && showControls && (
                <p style={{
                  fontSize: 9,
                  fontWeight: 600,
                  color: "rgba(255,255,255,0.4)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  margin: "4px 0 0",
                }}>
                  {activeChannel.nome}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fmp-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(0.8); }
        }
        .fmp-volume-slider {
          -webkit-appearance: none;
          appearance: none;
          height: 3px;
          border-radius: 9999px;
          outline: none;
        }
        .fmp-volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 9px;
          height: 9px;
          border-radius: 9999px;
          background: #ffffff;
          border: 1.5px solid #0055ff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          cursor: pointer;
          transition: transform 0.15s ease;
        }
        .fmp-volume-slider::-webkit-slider-thumb:hover {
          transform: scale(1.2);
        }
        .fmp-volume-slider::-moz-range-thumb {
          width: 9px;
          height: 9px;
          border-radius: 9999px;
          background: #ffffff;
          border: 1.5px solid #0055ff;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          cursor: pointer;
        }
      `}</style>
    </div>
  );
}

const playBtn: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  border: "none",
  background: "#0055ff",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  flexShrink: 0,
  boxShadow: "0 2px 10px rgba(0, 85, 255, 0.4)",
  transition: "transform 0.15s ease, background 0.15s ease",
};

const ctrlBtn: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: "50%",
  border: "1px solid rgba(255,255,255,0.1)",
  background: "rgba(255,255,255,0.06)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  flexShrink: 0,
  transition: "all 0.15s ease",
};
