import { useEffect, useRef, useState, useCallback } from "react";

interface Props {
  videoUrl: string;          // for thumbnail extraction (local blob URL)
  duration: number;          // total seconds
  startSec: number;
  endSec: number;
  onChange: (start: number, end: number) => void;
  thumbCount?: number;
  /** When provided, real audio waveform is drawn from this file. Otherwise placeholder. */
  audioFile?: File | null;
  videoTitle?: string;
}

function fmt(sec: number) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export default function PremiereTimeline({
  videoUrl, duration, startSec, endSec, onChange,
  thumbCount = 12, audioFile, videoTitle,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const audioCanvasRef = useRef<HTMLCanvasElement>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [waveform, setWaveform] = useState<number[] | null>(null);
  const [dragging, setDragging] = useState<"start" | "end" | "range" | null>(null);
  const dragOffsetRef = useRef(0);

  // Generate thumbnails from the video element
  useEffect(() => {
    if (!videoUrl || duration <= 0) { setThumbs([]); return; }
    let cancelled = false;
    const v = document.createElement("video");
    v.src = videoUrl;
    v.crossOrigin = "anonymous";
    v.muted = true;
    v.preload = "metadata";

    const out: string[] = [];
    const captureAt = (t: number) => new Promise<string>((resolve) => {
      const onSeeked = () => {
        const c = document.createElement("canvas");
        const w = 160, h = 90;
        c.width = w; c.height = h;
        const ctx = c.getContext("2d");
        if (ctx) ctx.drawImage(v, 0, 0, w, h);
        v.removeEventListener("seeked", onSeeked);
        try { resolve(c.toDataURL("image/jpeg", 0.6)); } catch { resolve(""); }
      };
      v.addEventListener("seeked", onSeeked);
      v.currentTime = Math.min(Math.max(0.05, t), Math.max(0.1, duration - 0.1));
    });

    v.addEventListener("loadedmetadata", async () => {
      for (let i = 0; i < thumbCount; i++) {
        if (cancelled) return;
        const t = (duration / thumbCount) * i;
        try {
          const url = await captureAt(t);
          if (cancelled) return;
          out.push(url);
          setThumbs([...out]);
        } catch { /* ignore frame errors */ }
      }
    });

    return () => { cancelled = true; v.src = ""; };
  }, [videoUrl, duration, thumbCount]);

  // Decode audio waveform from local file
  useEffect(() => {
    if (!audioFile) { setWaveform(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const buf = await audioFile.arrayBuffer();
        const audio = await ctx.decodeAudioData(buf.slice(0));
        if (cancelled) return;
        const ch = audio.getChannelData(0);
        const samples = 400;
        const block = Math.floor(ch.length / samples);
        const peaks: number[] = [];
        for (let i = 0; i < samples; i++) {
          let max = 0;
          const start = i * block;
          for (let j = 0; j < block; j += 50) {
            const v = Math.abs(ch[start + j] || 0);
            if (v > max) max = v;
          }
          peaks.push(max);
        }
        setWaveform(peaks);
        ctx.close();
      } catch (e) {
        console.warn("waveform decode failed", e);
        setWaveform(null);
      }
    })();
    return () => { cancelled = true; };
  }, [audioFile]);

  // Draw waveform
  useEffect(() => {
    const canvas = audioCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width = canvas.clientWidth * window.devicePixelRatio;
    const h = canvas.height = canvas.clientHeight * window.devicePixelRatio;
    ctx.clearRect(0, 0, w, h);

    const peaks = waveform || (() => {
      // placeholder pseudo-random waveform
      const arr: number[] = [];
      for (let i = 0; i < 400; i++) arr.push(0.2 + Math.abs(Math.sin(i * 0.3) * Math.cos(i * 0.07)) * 0.7);
      return arr;
    })();

    const barW = w / peaks.length;
    ctx.fillStyle = waveform ? "rgba(56, 189, 248, 0.85)" : "rgba(148, 163, 184, 0.5)";
    peaks.forEach((p, i) => {
      const bh = Math.max(1, p * h * 0.9);
      ctx.fillRect(i * barW, (h - bh) / 2, Math.max(1, barW - 1), bh);
    });
  }, [waveform]);

  const pctStart = duration > 0 ? (startSec / duration) * 100 : 0;
  const pctEnd = duration > 0 ? (endSec / duration) * 100 : 0;

  const xToTime = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return ratio * duration;
  }, [duration]);

  const handleMove = useCallback((e: PointerEvent) => {
    if (!dragging) return;
    const t = xToTime(e.clientX);
    if (dragging === "start") {
      onChange(Math.min(t, endSec - 0.5), endSec);
    } else if (dragging === "end") {
      onChange(startSec, Math.max(t, startSec + 0.5));
    } else if (dragging === "range") {
      const len = endSec - startSec;
      const newStart = Math.max(0, Math.min(duration - len, t - dragOffsetRef.current));
      onChange(newStart, newStart + len);
    }
  }, [dragging, duration, endSec, startSec, onChange, xToTime]);

  useEffect(() => {
    if (!dragging) return;
    const up = () => setDragging(null);
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging, handleMove]);

  const startHandle = (kind: "start" | "end" | "range") => (e: React.PointerEvent) => {
    e.preventDefault();
    if (kind === "range") {
      const t = xToTime(e.clientX);
      dragOffsetRef.current = t - startSec;
    }
    setDragging(kind);
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#0f172a", border: "1px solid #1e293b" }}>
      <div className="px-3 py-2 flex items-center justify-between text-[10px] font-mono" style={{ backgroundColor: "#1e293b", color: "#cbd5e1" }}>
        <span className="font-bold truncate max-w-[60%]">{videoTitle || "Timeline"}</span>
        <span>{fmt(startSec)} → {fmt(endSec)} • {fmt(endSec - startSec)}</span>
      </div>

      <div ref={trackRef} className="relative select-none" style={{ touchAction: "none" }}>
        {/* Video layer */}
        <div className="flex h-16 bg-black">
          {Array.from({ length: thumbCount }).map((_, i) => (
            <div key={i} className="flex-1 border-r border-black overflow-hidden" style={{ backgroundColor: "#1e293b" }}>
              {thumbs[i] && <img src={thumbs[i]} alt="" className="w-full h-full object-cover" draggable={false} />}
            </div>
          ))}
        </div>

        {/* Audio layer */}
        <div className="h-12" style={{ backgroundColor: "#0c1424" }}>
          <canvas ref={audioCanvasRef} className="w-full h-full block" />
        </div>

        {/* Time ruler */}
        <div className="h-5 flex items-center text-[8px] font-mono" style={{ backgroundColor: "#1e293b", color: "#94a3b8" }}>
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} className="flex-1 border-l border-slate-700 pl-1">
              {fmt((duration / 10) * i)}
            </div>
          ))}
        </div>

        {/* Selection overlay */}
        {duration > 0 && (
          <>
            {/* Dim outside */}
            <div className="absolute top-0 bottom-0 left-0 pointer-events-none" style={{ width: `${pctStart}%`, backgroundColor: "rgba(0,0,0,0.55)" }} />
            <div className="absolute top-0 bottom-0 right-0 pointer-events-none" style={{ width: `${100 - pctEnd}%`, backgroundColor: "rgba(0,0,0,0.55)" }} />

            {/* Range bar (draggable) */}
            <div
              onPointerDown={startHandle("range")}
              className="absolute top-0 bottom-0 cursor-grab active:cursor-grabbing"
              style={{
                left: `${pctStart}%`,
                width: `${pctEnd - pctStart}%`,
                border: "2px solid #f59e0b",
                background: "rgba(245, 158, 11, 0.08)",
                boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.4)",
              }}
            />

            {/* Start handle */}
            <div
              onPointerDown={startHandle("start")}
              className="absolute top-0 bottom-0 flex items-center justify-center cursor-ew-resize"
              style={{ left: `calc(${pctStart}% - 8px)`, width: 16 }}
            >
              <div style={{ width: 4, height: "100%", backgroundColor: "#f59e0b", borderRadius: 2 }} />
              <div className="absolute -top-5 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold whitespace-nowrap"
                style={{ backgroundColor: "#f59e0b", color: "#000" }}>
                {fmt(startSec)}
              </div>
            </div>

            {/* End handle */}
            <div
              onPointerDown={startHandle("end")}
              className="absolute top-0 bottom-0 flex items-center justify-center cursor-ew-resize"
              style={{ left: `calc(${pctEnd}% - 8px)`, width: 16 }}
            >
              <div style={{ width: 4, height: "100%", backgroundColor: "#f59e0b", borderRadius: 2 }} />
              <div className="absolute -top-5 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold whitespace-nowrap"
                style={{ backgroundColor: "#f59e0b", color: "#000" }}>
                {fmt(endSec)}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="px-3 py-1.5 text-[9px] font-mono flex items-center gap-3" style={{ backgroundColor: "#1e293b", color: "#94a3b8" }}>
        <span>🎬 Vídeo</span>
        <span>🔊 Áudio {waveform ? "(real)" : "(preview)"}</span>
        <span className="ml-auto">Arraste as alças laranja para ajustar o corte</span>
      </div>
    </div>
  );
}
