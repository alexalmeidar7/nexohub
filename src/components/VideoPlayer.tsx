import { useEffect, useRef, useState } from "react";
import Hls from "hls.js";
import { Minimize2, Maximize2, X, Video } from "lucide-react";

const STREAM_URL = "https://video04.logicahost.com.br/radiopositivafm/radiopositivafm/chunklist_w896619194.m3u8";

export default function VideoPlayer() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [minimized, setMinimized] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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
      <button
        onClick={() => setMinimized(false)}
        className="fixed bottom-4 right-4 z-50 bg-gray-800 hover:bg-gray-700 text-white rounded-full w-12 h-12 flex items-center justify-center shadow-xl transition-all"
        title="Abrir vídeo"
      >
        <Video size={20} />
      </button>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`fixed bottom-4 right-4 z-50 rounded-xl overflow-hidden shadow-2xl border border-white/10 bg-black ${
        fullscreen ? "w-full h-full inset-0 rounded-none" : ""
      }`}
      style={fullscreen ? { position: "fixed", top: 0, left: 0, bottom: 0, right: 0 } : { width: 431, height: 242 }}
    >
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        muted
        playsInline
        autoPlay
      />
      <div className="absolute top-2 right-2 flex items-center gap-1">
        <button
          onClick={() => setMinimized(true)}
          className="bg-black/60 hover:bg-black/80 text-white rounded-full w-7 h-7 flex items-center justify-center transition-all"
          title="Minimizar"
        >
          <Minimize2 size={14} />
        </button>
        <button
          onClick={toggleFullscreen}
          className="bg-black/60 hover:bg-black/80 text-white rounded-full w-7 h-7 flex items-center justify-center transition-all"
          title="Tela cheia"
        >
          <Maximize2 size={14} />
        </button>
      </div>
    </div>
  );
}
