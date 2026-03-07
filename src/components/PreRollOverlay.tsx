import { useEffect, useState, useRef, RefObject } from "react";
import { Home, Radio, Film } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

const SKIP_DELAY = 5;

interface Props {
  prerollUrl: string;
  prerollVideoRef: RefObject<HTMLVideoElement>;
  prerollLinkUrl: string | null;
  prerollMediaType?: string;
  prerollYoutubeUrl?: string | null;
  onSkip: () => void;
  onEnded: () => void;
}

function extractYoutubeId(url: string): string | null {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : null;
}

export default function PreRollOverlay({ prerollUrl, prerollVideoRef, prerollLinkUrl, prerollMediaType, prerollYoutubeUrl, onSkip, onEnded }: Props) {
  const [countdown, setCountdown] = useState(SKIP_DELAY);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [ytFailed, setYtFailed] = useState(false);
  const isYoutube = prerollMediaType === "youtube" && prerollYoutubeUrl;
  const ytId = isYoutube ? extractYoutubeId(prerollYoutubeUrl!) : null;
  const ytPlayerRef = useRef<any>(null);
  const pollRef = useRef<ReturnType<typeof setInterval>>();
  const onEndedRef = useRef(onEnded);
  onEndedRef.current = onEnded;

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(t);
  }, [countdown]);

  // Track time for native video
  useEffect(() => {
    if (isYoutube) return;
    const video = prerollVideoRef.current;
    if (!video) return;
    const onTime = () => setCurrentTime(video.currentTime);
    const onDur = () => setDuration(video.duration || 0);
    video.addEventListener("timeupdate", onTime);
    video.addEventListener("loadedmetadata", onDur);
    video.addEventListener("durationchange", onDur);
    return () => {
      video.removeEventListener("timeupdate", onTime);
      video.removeEventListener("loadedmetadata", onDur);
      video.removeEventListener("durationchange", onDur);
    };
  }, [isYoutube, prerollVideoRef]);

  // Track time for YouTube with stall/error detection
  useEffect(() => {
    if (!isYoutube || !ytId) return;

    const fallback = setTimeout(() => onEndedRef.current(), 120000);

    // Detect YouTube stall (captcha, region block, etc.) — no progress after 8s = failed
    let progressDetected = false;
    const stallTimer = setTimeout(() => {
      if (!progressDetected) {
        setYtFailed(true);
        setTimeout(() => onEndedRef.current(), 3000);
      }
    }, 8000);

    const initPlayer = () => {
      ytPlayerRef.current = new (window as any).YT.Player("preroll-yt-player", {
        videoId: ytId,
        playerVars: {
          autoplay: 1,
          controls: 0,
          showinfo: 0,
          rel: 0,
          modestbranding: 1,
          disablekb: 1,
          iv_load_policy: 3,
          fs: 0,
          cc_load_policy: 0,
          playsinline: 1,
        },
        events: {
          onReady: () => {
            pollRef.current = setInterval(() => {
              try {
                const p = ytPlayerRef.current;
                const t = p?.getCurrentTime?.() || 0;
                if (t > 0.5) progressDetected = true;
                setCurrentTime(t);
                if (p?.getDuration) setDuration(p.getDuration());
              } catch {}
            }, 500);
          },
          onStateChange: (event: any) => {
            if (event.data === 0) onEndedRef.current();
          },
          onError: () => {
            setYtFailed(true);
            setTimeout(() => onEndedRef.current(), 2000);
          },
        },
      });
    };

    if ((window as any).YT?.Player) {
      initPlayer();
    } else {
      if (!document.getElementById("yt-iframe-api")) {
        const tag = document.createElement("script");
        tag.id = "yt-iframe-api";
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
      }
      (window as any).onYouTubeIframeAPIReady = initPlayer;
    }

    return () => {
      clearTimeout(fallback);
      clearTimeout(stallTimer);
      if (pollRef.current) clearInterval(pollRef.current);
      try { ytPlayerRef.current?.destroy(); } catch {}
    };
  }, [isYoutube, ytId]);

  const canSkip = countdown <= 0;

  return (
    <div
      className="absolute inset-0 z-[100] flex items-center justify-center p-8"
      style={{
        background: "linear-gradient(to bottom right, hsl(0 100% 50%), hsl(0 0% 0%) 40%)",
      }}
    >
      {/* Sidebar menu */}
      <aside
        className="fixed left-0 top-0 bottom-0 w-20 flex flex-col items-center justify-center gap-3 z-[101]"
        style={{ background: "linear-gradient(to right, rgba(0,0,0,0.85), transparent)" }}
      >
        {[
          { icon: Home, label: "Home" },
          { icon: Radio, label: "Streaming" },
          { icon: Film, label: "Conteúdo" },
        ].map(item => (
          <button
            key={item.label}
            className={`w-12 h-12 rounded-xl flex items-center justify-center transition-colors ${
              item.label === "Streaming"
                ? "bg-player-accent text-player-foreground"
                : "bg-player-surface text-player-muted-foreground hover:bg-player-surface-hover hover:text-player-foreground"
            }`}
            title={item.label}
          >
            <item.icon className="h-5 w-5" />
          </button>
        ))}
      </aside>
      {/* Container principal — aspect-video */}
      <div
        className="relative w-full max-w-6xl shadow-2xl overflow-hidden"
        style={{
          aspectRatio: "16 / 9",
          backgroundColor: "hsl(0 0% 0%)",
          borderRadius: "2rem",
        }}
      >
        {/* Vídeo / YouTube */}
        {isYoutube && ytId ? (
          <>
            {/* YouTube player container — slightly oversized to crop YouTube UI */}
            <div
              className="absolute z-[1]"
              style={{
                top: "-60px",
                left: "-10px",
                right: "-10px",
                bottom: "-60px",
                opacity: ytFailed ? 0 : 1,
                transition: "opacity 0.5s ease",
              }}
            >
              <div id="preroll-yt-player" className="w-full h-full" />
            </div>
            {/* Transparent overlay to block interaction with YouTube */}
            <div className="absolute inset-0 z-[2]" />

            {/* Fallback when YouTube is blocked/captcha */}
            {ytFailed && (
              <div className="absolute inset-0 z-[3] flex flex-col items-center justify-center gap-4 animate-fade-in">
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: "hsl(0 100% 40%)" }}
                >
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </div>
                <p className="text-white/70 text-sm font-medium">Avançando automaticamente...</p>
                <div className="w-32 h-1 rounded-full overflow-hidden" style={{ backgroundColor: "hsl(0 0% 20%)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{
                      backgroundColor: "hsl(0 100% 50%)",
                      animation: "preroll-progress 3s linear forwards",
                    }}
                  />
                </div>
              </div>
            )}
          </>
        ) : (
          <video
            ref={prerollVideoRef}
            src={prerollUrl}
            autoPlay
            className="absolute inset-0 w-full h-full object-contain"
            onEnded={onEnded}
          />
        )}

        {/* Botão Pular + Tempo — canto superior direito */}
        <div className="absolute top-6 right-6 z-10 flex items-center gap-3">
          {/* Tempo percorrido / total */}
          {duration > 0 && !ytFailed && (
            <span
              className="text-xs font-mono px-3 py-1.5 rounded-full"
              style={{ backgroundColor: "hsla(0, 0%, 0%, 0.5)", color: "hsla(0, 0%, 100%, 0.8)" }}
            >
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          )}
          <button
            onClick={canSkip ? onSkip : undefined}
            className={`flex items-center gap-1 px-4 py-1.5 rounded-full text-sm font-medium transition-all ${
              canSkip
                ? "cursor-pointer hover:brightness-110"
                : "cursor-not-allowed opacity-80"
            }`}
            style={{ backgroundColor: "hsl(0 100% 40%)", color: "white" }}
            disabled={!canSkip}
          >
            pular{!canSkip && ` ${countdown}s`}
            {canSkip && <span className="ml-0.5">›</span>}
          </button>
        </div>

        {/* Widget QR Code — canto inferior esquerdo */}
        {prerollLinkUrl && (
          <a
            href={prerollLinkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="absolute bottom-6 left-6 z-10 flex flex-col items-center justify-center p-3 rounded-xl transition-transform hover:scale-105"
            style={{ backgroundColor: "hsl(0 100% 40%)" }}
          >
            <div className="bg-white rounded-md p-2 w-20 h-20 flex items-center justify-center">
              <QRCodeSVG
                value={prerollLinkUrl}
                size={64}
                level="M"
                bgColor="#ffffff"
                fgColor="#000000"
              />
            </div>
            <span className="text-white text-[10px] mt-2 font-semibold text-center leading-tight">
              clique/escaneie
            </span>
          </a>
        )}
      </div>

      <style>{`
        @keyframes preroll-progress {
          from { width: 0%; }
          to { width: 100%; }
        }
        .animate-fade-in {
          animation: preroll-fade-in 0.4s ease-out;
        }
        @keyframes preroll-fade-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}
