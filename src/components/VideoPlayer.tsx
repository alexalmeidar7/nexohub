import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Minimize2, Maximize2, Video, Volume2, VolumeX } from "lucide-react";

const STREAM_URL = "https://video04.logicahost.com.br/radiopositivafm/radiopositivafm/chunklist_w896619194.m3u8";

export default function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [minimized, setMinimized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (Hls.isSupported()) {
      const hls = new Hls({ enableWorker: true, lowLatencyMode: true });
      hlsRef.current = hls;
      hls.loadSource(STREAM_URL);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        video.play().catch(() => {});
      });
      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = STREAM_URL;
      video.addEventListener("loadedmetadata", () => video.play().catch(() => {}));
    }
  }, [minimized]);

  useEffect(() => {
    const handler = () => {
      if (!document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!fullscreen) {
      containerRef.current.requestFullscreen?.();
      setFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setFullscreen(false);
    }
  };

  if (minimized) {
    return (
      <div className="rounded-xl overflow-hidden shadow-2xl" style={{ backgroundColor: "#2a2a2a" }}>
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-2">
            <Video size={14} className="text-red-400" />
            <span className="text-white text-xs font-semibold">Positiva FM - Vídeo ao vivo</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setMuted(!muted)}
              className="bg-white/10 hover:bg-white/20 text-white rounded-full w-7 h-7 flex items-center justify-center transition-all"
              title={muted ? "Ativar som" : "Desativar som"}
            >
              {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
            </button>
            <button
              onClick={() => setMinimized(false)}
              className="bg-white/10 hover:bg-white/20 text-white rounded-full w-7 h-7 flex items-center justify-center transition-all"
              title="Expandir"
            >
              <Maximize2 size={13} />
            </button>
          </div>
        </div>
        {/* Keep video alive but hidden */}
        <video ref={videoRef} className="hidden" muted={muted} playsInline autoPlay />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`rounded-xl overflow-hidden shadow-2xl flex flex-col ${
        fullscreen ? "!rounded-none !fixed !inset-0 !z-50" : ""
      }`}
      style={
        fullscreen
          ? { width: "100%", height: "100%", backgroundColor: "#000" }
          : { backgroundColor: "#2a2a2a" }
      }
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 shrink-0">
        <div className="flex items-center gap-2">
          <Video size={14} className="text-red-400" />
          <span className="text-white text-xs font-semibold">Positiva FM - Vídeo ao vivo</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMuted(!muted)}
            className="bg-white/10 hover:bg-white/20 text-white rounded-full w-7 h-7 flex items-center justify-center transition-all"
            title={muted ? "Ativar som" : "Desativar som"}
          >
            {muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>
          <button
            onClick={() => setMinimized(true)}
            className="bg-white/10 hover:bg-white/20 text-white rounded-full w-7 h-7 flex items-center justify-center transition-all"
            title="Minimizar"
          >
            <Minimize2 size={13} />
          </button>
          <button
            onClick={toggleFullscreen}
            className="bg-white/10 hover:bg-white/20 text-white rounded-full w-7 h-7 flex items-center justify-center transition-all"
            title="Tela cheia"
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* Video */}
      <div style={fullscreen ? { flex: 1 } : { height: 242 }}>
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          muted={muted}
          playsInline
          autoPlay
        />
      </div>
    </div>
  );
}
