import { useEffect, useRef, useState, useCallback } from "react";
import type HlsType from "hls.js";
import { X, Volume2, VolumeX, Maximize2 } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";

const MINI_PLAYER_KEY = "mini_player_data";

let hlsModule: typeof import("hls.js") | null = null;
const getHls = async () => {
  if (!hlsModule) hlsModule = await import("hls.js");
  return hlsModule.default;
};

// Global audio element — unlocked once during user gesture, reused across mounts
let globalAudio: HTMLAudioElement | null = null;
let globalHls: HlsType | null = null;

export interface MiniPlayerData {
  url: string;
  name: string;
  channelId: string;
  type: string; // "audio_live" | "video_live" | "video"
  logoUrl?: string;
  musicTitle?: string;
  musicArtist?: string;
}

export function saveMiniPlayerData(data: MiniPlayerData) {
  localStorage.setItem(MINI_PLAYER_KEY, JSON.stringify(data));
}

export function clearMiniPlayerData() {
  localStorage.removeItem(MINI_PLAYER_KEY);
}

export function loadMiniPlayerData(): MiniPlayerData | null {
  try {
    const raw = localStorage.getItem(MINI_PLAYER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * Call this SYNCHRONOUSLY inside a user gesture (e.g. "Sim" button click)
 * to unlock the global audio element for autoplay.
 */
export function unlockAndPrepareMiniAudio(url: string) {
  if (!globalAudio) {
    globalAudio = new Audio();
  }
  // Play empty to unlock in user gesture context
  globalAudio.src = "";
  globalAudio.play().catch(() => {});
  // Store URL for later use
  globalAudio.dataset.pendingUrl = url;
}

export function destroyMiniAudio() {
  if (globalHls) {
    globalHls.destroy();
    globalHls = null;
  }
  if (globalAudio) {
    globalAudio.pause();
    globalAudio.src = "";
  }
}

export default function MiniPlayerWidget({ data, onClose }: { data: MiniPlayerData; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<HlsType | null>(null);
  const [muted, setMuted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const navigate = useNavigate();
  const { userSlug } = useParams();

  const isVideo = data.type === "video_live" || data.type === "video";

  // Audio streaming — uses the global pre-unlocked audio element
  useEffect(() => {
    if (isVideo) return;

    let cancelled = false;

    (async () => {
      const Hls = await getHls();
      if (cancelled) return;

      // Use global audio element (already unlocked during user gesture)
      if (!globalAudio) {
        globalAudio = new Audio();
      }
      const audio = globalAudio;

      if (globalHls) {
        globalHls.destroy();
        globalHls = null;
      }

      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        globalHls = hls;
        hls.loadSource(data.url);
        hls.attachMedia(audio);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          audio.muted = false;
          audio.play().then(() => {
            setPlaying(true);
          }).catch(() => {
            // Fallback: try muted
            audio.muted = true;
            audio.play().then(() => {
              setPlaying(true);
              // Try to unmute
              setTimeout(() => { audio.muted = false; }, 200);
            }).catch((e) => {
              console.error("[MiniPlayer] Audio play failed:", e);
            });
          });
        });
        hls.on(Hls.Events.ERROR, (_event: any, errData: any) => {
          if (errData.fatal) {
            console.error("[MiniPlayer] HLS fatal error:", errData);
            hls.destroy();
          }
        });
      } else if (audio.canPlayType("application/vnd.apple.mpegurl")) {
        audio.src = data.url;
        audio.addEventListener("loadedmetadata", () => {
          audio.play().then(() => setPlaying(true)).catch(() => {
            audio.muted = true;
            audio.play().then(() => setPlaying(true)).catch(() => {});
          });
        }, { once: true });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [data.url, isVideo]);

  // Video streaming
  useEffect(() => {
    if (!isVideo || !videoRef.current) return;
    const mediaEl = videoRef.current;
    let cancelled = false;

    (async () => {
      const Hls = await getHls();
      if (cancelled) return;
      if (Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
        hlsRef.current = hls;
        hls.loadSource(data.url);
        hls.attachMedia(mediaEl);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          mediaEl.muted = true; // Video must start muted for autoplay
          mediaEl.play().then(() => setPlaying(true)).catch(() => {});
        });
      }
    })();

    return () => {
      cancelled = true;
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [data.url, isVideo]);

  // Sync muted state with global audio
  useEffect(() => {
    if (!isVideo && globalAudio) {
      globalAudio.muted = muted;
    }
  }, [muted, isVideo]);

  const handleClose = useCallback(() => {
    destroyMiniAudio();
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    clearMiniPlayerData();
    onClose();
  }, [onClose]);

  const handleExpand = useCallback(() => {
    // Stop mini player audio before expanding
    destroyMiniAudio();
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    clearMiniPlayerData();
    const path = userSlug
      ? `/user/${userSlug}/nexohub/player/watch?ch=${data.channelId}`
      : `/user/nexohub/player/watch?ch=${data.channelId}`;
    navigate(path);
  }, [data.channelId, userSlug, navigate]);

  const glassStyle = {
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    boxShadow: "0 12px 40px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
    border: "1px solid rgba(255,255,255,0.12)",
  } as const;

  return (
    <div
      className="fixed bottom-5 right-5 z-[100] rounded-2xl overflow-hidden animate-fade-in"
      style={{ ...glassStyle, width: isVideo ? 320 : 280 }}
    >
      {/* Video area */}
      {isVideo && (
        <div className="relative w-full" style={{ aspectRatio: "16/9" }}>
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            muted={muted}
            playsInline
            autoPlay
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        {/* Logo/icon */}
        {data.logoUrl ? (
          <img src={data.logoUrl} alt="" className="w-8 h-8 rounded-lg object-contain flex-shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "rgba(230,0,0,0.2)" }}>
            <Volume2 size={14} style={{ color: "#e60000" }} />
          </div>
        )}

        {/* Name + Music info */}
        <div className="flex-1 min-w-0">
          <p className="text-white text-xs font-bold truncate">{data.name}</p>
          {data.musicTitle && data.musicTitle !== "Sem título" ? (
            <p className="text-white/50 text-[10px] truncate">♫ {data.musicTitle} — {data.musicArtist || ""}</p>
          ) : (
            <div className="flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: "hsl(0 80% 50%)" }} />
              <span className="text-white/40 text-[10px]">{playing ? "Ao vivo" : "Conectando..."}</span>
            </div>
          )}
        </div>

        {/* Buttons */}
        <button
          onClick={() => setMuted(!muted)}
          className="text-white/50 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-all"
          title={muted ? "Ativar som" : "Mudo"}
        >
          {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
        <button
          onClick={handleExpand}
          className="text-white/50 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-all"
          title="Expandir"
        >
          <Maximize2 size={14} />
        </button>
        <button
          onClick={handleClose}
          className="text-white/50 hover:text-white hover:bg-white/10 rounded-lg p-1.5 transition-all"
          title="Fechar"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
