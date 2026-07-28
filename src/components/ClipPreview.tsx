import { useEffect, useRef, useState } from "react";
import { Play, Pause, RotateCcw } from "lucide-react";

type Props = {
  mode: "youtube" | "local";
  videoId: string | null;
  localUrl: string;
  startSeconds: number;
  endSeconds: number;
  format: "fullhd" | "reel" | "original";
};

export default function ClipPreview({ mode, videoId, localUrl, startSeconds, endSeconds, format }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(startSeconds);
  const rafRef = useRef<number | null>(null);

  const aspect = format === "reel" ? "9 / 16" : "16 / 9";
  const maxWidth = format === "reel" ? 260 : 640;

  // YouTube preview via iframe
  if (mode === "youtube" && videoId) {
    const s = Math.floor(startSeconds);
    const e = Math.ceil(endSeconds);
    const src = `https://www.youtube.com/embed/${videoId}?start=${s}&end=${e}&autoplay=0&rel=0&modestbranding=1`;
    return (
      <div className="mx-auto w-full" style={{ maxWidth }}>
        <div className="rounded-xl overflow-hidden bg-black" style={{ aspectRatio: aspect }}>
          <iframe
            src={src}
            title="Pré-visualização"
            className="w-full h-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
        </div>
      </div>
    );
  }

  // Local preview constrained to [start, end]
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => {
      try { v.currentTime = startSeconds; } catch {}
      setCurrent(startSeconds);
    };
    v.addEventListener("loadedmetadata", onLoaded);
    return () => v.removeEventListener("loadedmetadata", onLoaded);
  }, [startSeconds, localUrl]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const tick = () => {
      if (!v.paused && !v.ended) {
        setCurrent(v.currentTime);
        if (v.currentTime >= endSeconds) {
          v.pause();
          v.currentTime = endSeconds;
          setPlaying(false);
          return;
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [endSeconds]);

  const togglePlay = async () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime < startSeconds || v.currentTime >= endSeconds) {
        v.currentTime = startSeconds;
      }
      await v.play();
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const restart = () => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = startSeconds;
    setCurrent(startSeconds);
  };

  const clipDur = Math.max(0.001, endSeconds - startSeconds);
  const relPct = Math.max(0, Math.min(100, ((current - startSeconds) / clipDur) * 100));

  if (mode === "local" && !localUrl) {
    return <div className="text-xs opacity-60 text-center py-4">Nenhum vídeo carregado.</div>;
  }

  return (
    <div className="mx-auto w-full" style={{ maxWidth }}>
      <div className="rounded-xl overflow-hidden bg-black relative" style={{ aspectRatio: aspect }}>
        <video
          ref={videoRef}
          src={localUrl}
          className="w-full h-full"
          style={{ objectFit: format === "original" ? "contain" : "cover" }}
          playsInline
          preload="metadata"
        />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={togglePlay}
          className="flex items-center justify-center rounded-full w-8 h-8"
          style={{ background: "var(--layout-page-text, #1a1a1a)", color: "var(--layout-page-bg, #fff)" }}
          aria-label={playing ? "Pausar" : "Reproduzir"}
        >
          {playing ? <Pause size={14} /> : <Play size={14} />}
        </button>
        <button
          type="button"
          onClick={restart}
          className="flex items-center justify-center rounded-full w-8 h-8"
          style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 12%, transparent)", color: "var(--layout-page-text, #1a1a1a)" }}
          aria-label="Reiniciar"
        >
          <RotateCcw size={14} />
        </button>
        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 15%, transparent)" }}>
          <div className="h-full transition-[width] duration-100" style={{ width: `${relPct}%`, background: "var(--layout-page-text, #1a1a1a)" }} />
        </div>
        <div className="text-[10px] font-mono tabular-nums" style={{ color: "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 70%, transparent)" }}>
          {Math.max(0, current - startSeconds).toFixed(1)}s / {clipDur.toFixed(1)}s
        </div>
      </div>
    </div>
  );
}
