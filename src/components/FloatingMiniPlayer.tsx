import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { Play, Pause, Volume2, VolumeX, ChevronLeft, ChevronRight, Loader2, Radio } from "lucide-react";
import { useAlbumColors } from "@/hooks/useAlbumColors";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { readMusicData, writeMusicData, MUSIC_DATA_EVENT } from "@/lib/musicStorageKeys";
import { getStationDatabaseSync } from "@/lib/stationDatabaseService";
import { findClientAccountByEmail, findClientAccountById } from "@/lib/clientAuthAccounts";
import { fetchTrackCover, getTrackCoverSync } from "@/lib/musicCoverResolver";
import { mountPlayerVideoHost, parkPlayerVideoHost } from "@/lib/playerVideoHost";

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
  const { user } = useAuth();

  // Multi-tenant station resolution
  const clientAcc = (effectiveUserId && findClientAccountById(effectiveUserId)) ||
                    (user?.id && findClientAccountById(user.id)) ||
                    (user?.email && findClientAccountByEmail(user.email));
  const stationUid = effectiveUserId || clientAcc?.parentUserId || clientAcc?.id || user?.id;
  const stationSlug = clientAcc?.slug || (user as any)?.user_metadata?.slug || (clientAcc?.email ? clientAcc.email.split("@")[0].toLowerCase() : "") || "";

  // STRICT tenant isolation: only the logged station's own ids may be used as
  // localStorage scopes. Using slugs or a hardcoded fallback (e.g. "positivafm")
  // made one station read/write another station's "música no ar" data, which is
  // why the widget could show a different radio's logo/cover.
  const candidateUids = useMemo(() => {
    return Array.from(new Set([
      stationUid,
      clientAcc?.id,
      clientAcc?.parentUserId,
      effectiveUserId,
      user?.id,
    ].filter(Boolean))) as string[];
  }, [stationUid, clientAcc?.id, clientAcc?.parentUserId, effectiveUserId, user?.id]);


  const [state, setState] = useState<MusicState>(() => {
    const last = (window as any)?.__lastPlayerMusicState;
    if (last?.currentMusic?.titulo) return last;
    for (const uid of candidateUids) {
      try {
        const d = readMusicData(uid) as any;
        if (d && (d.titulo || d.excecao)) {
          const capa = d.capa || getTrackCoverSync(d.titulo, d.artista) || "";
          return {
            ...INITIAL,
            currentMusic: {
              titulo: d.titulo || "",
              artista: d.artista || "",
              capa: capa,
              excecao: d.excecao || null,
            },
            displayArt: capa || null,
          };
        }
      } catch {}
    }
    return INITIAL;
  });
  const [showControls, setShowControls] = useState(false);
  const wantVideoBox = String(state.activeChannel?.type || "").includes("video") && (state.isPlaying || state.isLoading);
  const [videoRendered, setVideoRendered] = useState(wantVideoBox);
  useEffect(() => {
    if (wantVideoBox) {
      setVideoRendered(true);
      return;
    }
    const t = window.setTimeout(() => setVideoRendered(false), 400);
    return () => clearTimeout(t);
  }, [wantVideoBox]);
  const videoSlotRef = useCallback((node: HTMLDivElement | null) => {
    if (node) mountPlayerVideoHost(node);
    else parkPlayerVideoHost();
  }, []);
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
      for (const uid of candidateUids) {
        try {
          const d = readMusicData(uid) as any;
          if (d && (d.titulo || d.excecao)) {
            const capa = d.capa || getTrackCoverSync(d.titulo, d.artista) || "";
            setState(prev => ({
              ...prev,
              currentMusic: {
                titulo: d.titulo || "",
                artista: d.artista || "",
                capa: capa,
                excecao: d.excecao || null,
              },
              displayArt: capa || prev.displayArt,
            }));
            break;
          }
        } catch {}
      }
    };
    onStorage();

    window.addEventListener("storage", onStorage);
    window.addEventListener(MUSIC_DATA_EVENT, onStorage as EventListener);

    // Realtime broadcast listener for instant cross-computer synchronization
    const activeChannels: any[] = [];
    for (const uid of candidateUids) {
      const ch = supabase
        .channel(`music-live-sync:${uid}`)
        .on("broadcast", { event: "track_change" }, (payload: any) => {
          const d = payload.payload || payload;
          if (d && (d.titulo || d.excecao)) {
            const capa = d.capa || getTrackCoverSync(d.titulo, d.artista) || "";
            const track = { ...d, capa };
            for (const target of candidateUids) {
              writeMusicData(target, track);
            }
            setState(prev => ({
              ...prev,
              currentMusic: {
                titulo: d.titulo || "",
                artista: d.artista || "",
                capa: capa,
                excecao: d.excecao || null,
              },
              displayArt: capa || prev.displayArt,
            }));
          } else if (d && d.titulo === "" && d.artista === "") {
            setState(prev => ({
              ...prev,
              currentMusic: null,
              displayArt: null,
            }));
          }
        })
        .subscribe();
      activeChannels.push(ch);
    }

    // Active track fetch from server / database so other computers get the playing track immediately on load
    const fetchActiveTrackFromRemote = async () => {
      // 1. Tentar carregar faixa do endpoint local de sincronização direta (/api/sync-music)
      try {
        const syncRes = await fetch(`/api/sync-music?slug=${encodeURIComponent(stationSlug)}&userId=${encodeURIComponent(stationUid || "")}`, { cache: "no-store" });
        if (syncRes.ok) {
          const syncJson = await syncRes.json();
          const live = syncJson?.music;
          if (live?.titulo && live.titulo.toLowerCase() !== "sem título" && live.titulo !== "Aguardando leitura...") {
            const liveDur = Number(live.duracao) || 180;
            let liveCapa = live.capa || getTrackCoverSync(live.titulo, live.artista) || "";
            if (!liveCapa) {
              try {
                liveCapa = await fetchTrackCover(live.titulo, live.artista);
              } catch {}
            }
            const liveTrack = {
              titulo: live.titulo,
              artista: live.artista || "Desconhecido",
              capa: liveCapa || "",
              duracao: liveDur,
            };
            for (const target of candidateUids) {
              writeMusicData(target, liveTrack);
            }
            setState(prev => ({
              ...prev,
              currentMusic: liveTrack,
              displayArt: liveCapa || prev.displayArt,
            }));
            return;
          }
        }
      } catch {}

      // 2. Verificar banco de dados em user_settings para todos os candidateUids
      for (const uid of candidateUids) {
        try {
          const { data: settings } = await supabase
            .from("user_settings")
            .select("dashboard_items")
            .eq("user_id", uid)
            .maybeSingle();

          const di = (settings?.dashboard_items || {}) as Record<string, any>;
          const curTitle = (di.music_current_title || "").toString().trim();
          const curArtist = (di.music_current_artist || "").toString().trim();
          let curCover = (di.music_current_cover || "").toString().trim();
          const curExcecao = di.music_current_excecao || null;
          if (curTitle && curTitle.toLowerCase() !== "sem título" && curTitle.toLowerCase() !== "sem titulo" && curTitle.toLowerCase() !== "aguardando leitura...") {
            if (!curCover) {
              curCover = getTrackCoverSync(curTitle, curArtist) || "";
              if (!curCover) {
                try {
                  curCover = await fetchTrackCover(curTitle, curArtist);
                } catch {}
              }
            }
            const trackData = {
              titulo: curTitle,
              artista: curArtist || "Desconhecido",
              capa: curCover || "",
              excecao: curExcecao,
            };
            for (const target of candidateUids) {
              writeMusicData(target, trackData);
            }
            setState(prev => ({
              ...prev,
              currentMusic: trackData,
              displayArt: curCover || prev.displayArt,
            }));
            return;
          }
        } catch {}
      }
    };

    fetchActiveTrackFromRemote();
    const pollRemote = setInterval(fetchActiveTrackFromRemote, 4000);

    return () => {
      clearInterval(pollRemote);
      for (const ch of activeChannels) {
        supabase.removeChannel(ch);
      }
      window.removeEventListener("player:music", onMusic as EventListener);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(MUSIC_DATA_EVENT, onStorage as EventListener);
    };
  }, [candidateUids, stationSlug, stationUid]);

  // Auto-resolve real cover when title exists but cover is missing
  useEffect(() => {
    const t = state.currentMusic?.titulo;
    const a = state.currentMusic?.artista;
    if (t && t.toLowerCase() !== "sem título" && t !== "Aguardando leitura..." && !state.displayArt && !state.currentMusic?.capa) {
      let active = true;
      fetchTrackCover(t, a || "").then((coverUrl) => {
        if (active && coverUrl) {
          setState(prev => ({
            ...prev,
            displayArt: coverUrl,
            currentMusic: prev.currentMusic ? { ...prev.currentMusic, capa: coverUrl } : null,
          }));
          for (const target of candidateUids) {
            writeMusicData(target, { ...state.currentMusic, capa: coverUrl });
          }
        }
      }).catch(() => {});
      return () => { active = false; };
    }
  }, [state.currentMusic?.titulo, state.currentMusic?.artista, state.displayArt, state.currentMusic?.capa, candidateUids]);

  // Track info resolution for smooth entrance / exit animation
  const targetTitulo = (state.currentMusic?.titulo || state.activeChannel?.nome || "").trim();
  const targetArtista = (state.currentMusic?.artista || (state.activeChannel?.nome ? "Ao vivo" : "")).trim();
  // Never show a leftover cover/logo when there is no real track playing.
  const hasRealTrack = !!targetTitulo && !["sem título", "sem titulo", "sem reprodução", "sem reproducao", "aguardando leitura..."].includes(targetTitulo.toLowerCase());
  const targetArt = hasRealTrack
    ? (state.displayArt || state.currentMusic?.capa || getTrackCoverSync(targetTitulo, targetArtista) || null)
    : null;

  // A animação depende só de música/artista; a capa que chega depois entra sem reanimar.
  const currentKey = `${targetTitulo}:::${targetArtista}`;
  const latestTargetRef = useRef({ titulo: targetTitulo, artista: targetArtista, art: targetArt });
  latestTargetRef.current = { titulo: targetTitulo, artista: targetArtista, art: targetArt };

  const [displayedInfo, setDisplayedInfo] = useState<DisplayedMusicInfo>(() => ({
    titulo: targetTitulo,
    artista: targetArtista,
    art: targetArt,
  }));
  const [animPhase, setAnimPhase] = useState<AnimPhase>("idle");

  const lastKeyRef = useRef<string>(currentKey);
  const animTimerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (lastKeyRef.current !== currentKey) {
      lastKeyRef.current = currentKey;

      if (animTimerRef.current) clearTimeout(animTimerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);

      setAnimPhase("exiting");

      animTimerRef.current = window.setTimeout(() => {
        setDisplayedInfo({ ...latestTargetRef.current });
        setAnimPhase("entering-prep");

        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = requestAnimationFrame(() => {
            setAnimPhase("idle");
          });
        });
      }, 220);
    }
  }, [currentKey]);

  // Capa resolvida depois do texto: atualiza sem animação.
  useEffect(() => {
    if (lastKeyRef.current !== currentKey) return;
    setDisplayedInfo(prev => {
      const t = latestTargetRef.current;
      return prev.titulo === t.titulo && prev.artista === t.artista && prev.art !== t.art ? { ...prev, art: t.art } : prev;
    });
  }, [targetArt, currentKey]);

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
          {/* Vídeo discreto: aparece à esquerda da capa quando o canal de vídeo está tocando */}
          {videoRendered && (
            <div
              ref={videoSlotRef}
              className="fmp-video-box"
              style={{
                flexShrink: 0,
                position: "relative",
                width: 178,
                height: 100,
                borderRadius: 8,
                overflow: "hidden",
                background: "#000",
                border: "1px solid rgba(255,255,255,0.16)",
                boxShadow: "0 14px 40px rgba(0,0,0,0.55), 0 0 18px rgba(0,85,255,0.22)",
                animation: `${wantVideoBox ? "fmp-video-in" : "fmp-video-out"} 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards`,
                pointerEvents: wantVideoBox ? "auto" : "none",
              }}
            />
          )}
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
              <Radio size={28} style={{ color: "rgba(255,255,255,0.22)" }} />
            </div>
            {displayedInfo.art ? (
              <img
                key={displayedInfo.art}
                src={displayedInfo.art}
                alt={displayedInfo.titulo || ""}
                onError={async (e) => {
                  const currentImg = e.currentTarget as HTMLImageElement;
                  const t = displayedInfo.titulo;
                  const a = displayedInfo.artista;
                  if (t && t !== "Aguardando leitura..." && t.toLowerCase() !== "sem título") {
                    try {
                      const freshCover = await fetchTrackCover(t, a);
                      if (freshCover && freshCover !== displayedInfo.art) {
                        setDisplayedInfo(prev => ({ ...prev, art: freshCover }));
                        setState(prev => ({
                          ...prev,
                          displayArt: freshCover,
                          currentMusic: prev.currentMusic ? { ...prev.currentMusic, capa: freshCover } : null,
                        }));
                        for (const target of candidateUids) {
                          writeMusicData(target, { ...state.currentMusic, capa: freshCover });
                        }
                        return;
                      }
                    } catch {}
                  }
                  currentImg.style.display = "none";
                }}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  ...coverAnimStyle,
                }}
              />
            ) : null}

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
