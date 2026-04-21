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
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const [thumbs, setThumbs] = useState<string[]>([]);
  const [waveform, setWaveform] = useState<number[] | null>(null);
  const [dragging, setDragging] = useState<"start" | "end" | "range" | null>(null);
  const [playing, setPlaying] = useState(false);
  const [playhead, setPlayhead] = useState(0);
  const dragOffsetRef = useRef(0);
  const reverseRef = useRef<number | null>(null);
  // Viewport (zoom/pan window) in seconds
  const [viewStart, setViewStart] = useState(0);
  const [viewEnd, setViewEnd] = useState(0);
  const panRef = useRef<{ x: number; vs: number; ve: number } | null>(null);

  // Initialize / reset viewport when duration changes
  useEffect(() => {
    if (duration > 0) { setViewStart(0); setViewEnd(duration); }
  }, [duration]);

  const viewSpan = Math.max(0.5, viewEnd - viewStart);

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

  // Draw waveform — uses accent color from layout
  useEffect(() => {
    const canvas = audioCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const w = canvas.width = canvas.clientWidth * window.devicePixelRatio;
    const h = canvas.height = canvas.clientHeight * window.devicePixelRatio;
    ctx.clearRect(0, 0, w, h);

    const fullPeaks = waveform || (() => {
      const arr: number[] = [];
      for (let i = 0; i < 400; i++) arr.push(0.2 + Math.abs(Math.sin(i * 0.3) * Math.cos(i * 0.07)) * 0.7);
      return arr;
    })();
    // Slice peaks to current viewport
    const total = fullPeaks.length;
    const dur = duration > 0 ? duration : viewSpan;
    const i0 = Math.max(0, Math.floor((viewStart / dur) * total));
    const i1 = Math.max(i0 + 1, Math.ceil((viewEnd / dur) * total));
    const peaks = fullPeaks.slice(i0, i1);

    const accent = getComputedStyle(document.documentElement).getPropertyValue("--layout-accent-hex").trim() || "#888888";
    const barW = w / Math.max(1, peaks.length);
    ctx.fillStyle = accent;
    ctx.globalAlpha = waveform ? 0.85 : 0.35;
    peaks.forEach((p, i) => {
      const bh = Math.max(1, p * h * 0.9);
      ctx.fillRect(i * barW, (h - bh) / 2, Math.max(1, barW - 1), bh);
    });
    ctx.globalAlpha = 1;
  }, [waveform, viewStart, viewEnd, viewSpan, duration]);

  const tToPct = useCallback((t: number) => ((t - viewStart) / viewSpan) * 100, [viewStart, viewSpan]);
  const pctStart = tToPct(startSec);
  const pctEnd = tToPct(endSec);
  const pctPlay = tToPct(playhead);

  const xToTime = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    return viewStart + ratio * viewSpan;
  }, [viewStart, viewSpan]);

  // Wheel zoom (around cursor) + Shift-wheel horizontal pan
  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!duration) return;
    e.preventDefault();
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const ratio = (e.clientX - rect.left) / rect.width;
    const cursorT = viewStart + ratio * viewSpan;
    if (e.shiftKey) {
      const delta = (e.deltaY || e.deltaX) * (viewSpan / rect.width);
      let ns = viewStart + delta, ne = viewEnd + delta;
      if (ns < 0) { ne -= ns; ns = 0; }
      if (ne > duration) { ns -= (ne - duration); ne = duration; }
      setViewStart(Math.max(0, ns)); setViewEnd(Math.min(duration, ne));
    } else {
      const factor = e.deltaY > 0 ? 1.25 : 0.8;
      let newSpan = Math.max(0.5, Math.min(duration, viewSpan * factor));
      let ns = cursorT - ratio * newSpan;
      let ne = ns + newSpan;
      if (ns < 0) { ne -= ns; ns = 0; }
      if (ne > duration) { ns -= (ne - duration); ne = duration; }
      setViewStart(Math.max(0, ns)); setViewEnd(Math.min(duration, ne));
    }
  }, [duration, viewStart, viewEnd, viewSpan]);

  // Middle-mouse / Alt drag to pan
  const onPointerDownPan = (e: React.PointerEvent) => {
    if (!(e.button === 1 || e.altKey)) return;
    e.preventDefault();
    panRef.current = { x: e.clientX, vs: viewStart, ve: viewEnd };
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const p = panRef.current;
      if (!p) return;
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect) return;
      const delta = ((p.x - e.clientX) / rect.width) * (p.ve - p.vs);
      let ns = p.vs + delta, ne = p.ve + delta;
      if (ns < 0) { ne -= ns; ns = 0; }
      if (ne > duration) { ns -= (ne - duration); ne = duration; }
      setViewStart(ns); setViewEnd(ne);
    };
    const up = () => { panRef.current = null; };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); };
  }, [duration]);

  const resetZoom = () => { setViewStart(0); setViewEnd(duration); };
  const zoomToSelection = () => {
    if (endSec <= startSec) return;
    const pad = (endSec - startSec) * 0.2;
    setViewStart(Math.max(0, startSec - pad));
    setViewEnd(Math.min(duration, endSec + pad));
  };
  const zoomPct = duration > 0 ? Math.round((duration / viewSpan) * 10) / 10 : 1;

  const handleMove = useCallback((e: PointerEvent) => {
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

  // Toggle play/pause inside selected range
  const togglePlay = useCallback(() => {
    const v = previewVideoRef.current;
    if (!v) return;
    if (v.paused) {
      if (v.currentTime < startSec || v.currentTime >= endSec) v.currentTime = startSec;
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  }, [startSec, endSec]);

  // Keyboard shortcuts: Space play/pause, ←/→ frame step (Shift = 1s), J/K/L Premiere-style
  useEffect(() => {
    const FRAME = 1 / 30;
    const seekBy = (delta: number) => {
      const v = previewVideoRef.current;
      if (!v) return;
      const t = Math.max(startSec, Math.min(endSec, (v.currentTime || startSec) + delta));
      v.currentTime = t;
      setPlayhead(t);
    };
    const setRate = (r: number) => {
      const v = previewVideoRef.current;
      if (!v) return;
      if (reverseRef.current) { window.clearInterval(reverseRef.current); reverseRef.current = null; }
      if (r === 0) { v.pause(); return; }
      if (r < 0) {
        v.pause();
        const id = window.setInterval(() => {
          const nt = (v.currentTime || 0) - FRAME * Math.abs(r);
          if (nt <= startSec) { v.currentTime = startSec; window.clearInterval(id); reverseRef.current = null; return; }
          v.currentTime = nt;
        }, 33);
        reverseRef.current = id;
      } else {
        v.playbackRate = r;
        if (v.currentTime < startSec || v.currentTime >= endSec) v.currentTime = startSec;
        v.play().catch(() => {});
      }
    };
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement;
      const tag = tgt?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tgt?.isContentEditable) return;
      switch (e.code) {
        case "Space": e.preventDefault(); togglePlay(); break;
        case "ArrowLeft": e.preventDefault(); seekBy(e.shiftKey ? -1 : -FRAME); break;
        case "ArrowRight": e.preventDefault(); seekBy(e.shiftKey ? 1 : FRAME); break;
        case "KeyJ": e.preventDefault(); setRate(-1); break;
        case "KeyK": e.preventDefault(); setRate(0); break;
        case "KeyL": e.preventDefault(); setRate(1); break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (reverseRef.current) { window.clearInterval(reverseRef.current); reverseRef.current = null; }
    };
  }, [togglePlay, startSec, endSec]);

  // Track playhead and stop at endSec
  useEffect(() => {
    const v = previewVideoRef.current;
    if (!v) return;
    const onTime = () => {
      setPlayhead(v.currentTime);
      if (v.currentTime >= endSec) { v.pause(); v.currentTime = endSec; }
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
    };
  }, [endSec]);

  // Layout-derived colors via CSS variables
  const bg = "var(--layout-page-bg, #ffffff)";
  const headerBg = "var(--layout-header-bg, #1a1a1a)";
  const headerText = "var(--layout-header-text, #ffffff)";
  const accent = "var(--layout-accent-color, #444444)";
  const accentText = "var(--layout-button-text, #ffffff)";
  const border = "var(--layout-border-color, #333333)";
  const text = "var(--layout-page-text, #1a1a1a)";
  const muted = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 50%, transparent)";

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: bg, border: `1px solid color-mix(in srgb, ${border} 40%, transparent)`, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
      {/* Hidden controllable video for spacebar playback */}
      <video ref={previewVideoRef} src={videoUrl} className="hidden" preload="metadata" />

      {/* Header bar */}
      <div className="px-3 py-2 flex items-center justify-between text-[10px] font-mono" style={{ background: `linear-gradient(135deg, ${headerBg}, color-mix(in srgb, ${headerBg} 80%, white 20%))`, color: headerText }}>
        <div className="flex items-center gap-2 truncate max-w-[60%]">
          <button
            type="button"
            onClick={togglePlay}
            className="rounded-full w-6 h-6 flex items-center justify-center transition-transform hover:scale-110"
            style={{ backgroundColor: accent, color: accentText }}
            title="Espaço para Play/Pause"
          >
            {playing ? "❚❚" : "▶"}
          </button>
          <span className="font-bold truncate">{videoTitle || "Timeline"}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="opacity-90">{fmt(startSec)} → {fmt(endSec)} • {fmt(endSec - startSec)}</span>
          <div className="flex items-center gap-1 ml-2">
            <button type="button" onClick={() => { const c = (viewStart+viewEnd)/2, ns = Math.max(0.5, viewSpan*0.6); setViewStart(Math.max(0, c-ns/2)); setViewEnd(Math.min(duration, c+ns/2)); }} className="w-5 h-5 rounded text-[11px] font-bold" style={{ backgroundColor: `color-mix(in srgb, ${headerText} 15%, transparent)`, color: headerText }} title="Zoom +">＋</button>
            <span className="text-[9px] opacity-80 w-10 text-center">{zoomPct}x</span>
            <button type="button" onClick={() => { const c = (viewStart+viewEnd)/2, ns = Math.min(duration, viewSpan/0.6); setViewStart(Math.max(0, c-ns/2)); setViewEnd(Math.min(duration, c+ns/2)); }} className="w-5 h-5 rounded text-[11px] font-bold" style={{ backgroundColor: `color-mix(in srgb, ${headerText} 15%, transparent)`, color: headerText }} title="Zoom −">−</button>
            <button type="button" onClick={zoomToSelection} className="px-1.5 h-5 rounded text-[9px] font-bold" style={{ backgroundColor: accent, color: accentText }} title="Zoom no trecho">⛶</button>
            <button type="button" onClick={resetZoom} className="px-1.5 h-5 rounded text-[9px] font-bold" style={{ backgroundColor: `color-mix(in srgb, ${headerText} 15%, transparent)`, color: headerText }} title="Reset zoom">⟲</button>
          </div>
        </div>
      </div>

      <div ref={trackRef} onWheel={onWheel} onPointerDown={onPointerDownPan} className="relative select-none overflow-hidden" style={{ touchAction: "none" }}>
        {/* Video layer */}
        <div className="relative h-16 overflow-hidden" style={{ backgroundColor: `color-mix(in srgb, ${headerBg} 90%, black)` }}>
          <div className="absolute top-0 bottom-0 flex" style={{ left: `${-(viewStart/Math.max(0.001,duration))*100*(duration/viewSpan)}%`, width: `${(duration/viewSpan)*100}%` }}>
            {Array.from({ length: thumbCount }).map((_, i) => (
              <div key={i} className="flex-1 overflow-hidden" style={{ borderRight: `1px solid color-mix(in srgb, ${border} 30%, transparent)`, backgroundColor: `color-mix(in srgb, ${headerBg} 70%, black)` }}>
                {thumbs[i] && <img src={thumbs[i]} alt="" className="w-full h-full object-cover" draggable={false} />}
              </div>
            ))}
          </div>
        </div>

        {/* Audio layer */}
        <div className="h-12" style={{ backgroundColor: `color-mix(in srgb, ${headerBg} 95%, black)` }}>
          <canvas ref={audioCanvasRef} className="w-full h-full block" />
        </div>

        {/* Time ruler */}
        <div className="h-5 flex items-center text-[8px] font-mono" style={{ background: `linear-gradient(135deg, ${headerBg}, color-mix(in srgb, ${headerBg} 80%, white 20%))`, color: `color-mix(in srgb, ${headerText} 70%, transparent)` }}>
          {Array.from({ length: 11 }).map((_, i) => (
            <div key={i} className="flex-1 pl-1" style={{ borderLeft: `1px solid color-mix(in srgb, ${headerText} 15%, transparent)` }}>
              {fmt(viewStart + (viewSpan / 10) * i)}
            </div>
          ))}
        </div>

        {/* Selection overlay */}
        {duration > 0 && (
          <>
            <div className="absolute top-0 bottom-0 left-0 pointer-events-none" style={{ width: `${pctStart}%`, backgroundColor: "rgba(0,0,0,0.55)" }} />
            <div className="absolute top-0 bottom-0 right-0 pointer-events-none" style={{ width: `${100 - pctEnd}%`, backgroundColor: "rgba(0,0,0,0.55)" }} />

            {/* Range bar */}
            <div
              onPointerDown={startHandle("range")}
              className="absolute top-0 bottom-0 cursor-grab active:cursor-grabbing"
              style={{
                left: `${pctStart}%`,
                width: `${pctEnd - pctStart}%`,
                border: `2px solid ${accent}`,
                background: `color-mix(in srgb, ${accent} 12%, transparent)`,
                boxShadow: `inset 0 0 0 1px rgba(0,0,0,0.4), 0 0 0 1px color-mix(in srgb, ${accent} 40%, transparent)`,
              }}
            />

            {/* Playhead */}
            {playing && (
              <div className="absolute top-0 bottom-0 pointer-events-none" style={{ left: `${pctPlay}%`, width: 2, backgroundColor: accentText, boxShadow: `0 0 6px ${accent}` }} />
            )}

            {/* Start handle */}
            <div
              onPointerDown={startHandle("start")}
              className="absolute top-0 bottom-0 flex items-center justify-center cursor-ew-resize"
              style={{ left: `calc(${pctStart}% - 8px)`, width: 16 }}
            >
              <div style={{ width: 4, height: "100%", backgroundColor: accent, borderRadius: 2, boxShadow: `0 0 4px ${accent}` }} />
              <div className="absolute -top-5 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold whitespace-nowrap"
                style={{ backgroundColor: accent, color: accentText }}>
                {fmt(startSec)}
              </div>
            </div>

            {/* End handle */}
            <div
              onPointerDown={startHandle("end")}
              className="absolute top-0 bottom-0 flex items-center justify-center cursor-ew-resize"
              style={{ left: `calc(${pctEnd}% - 8px)`, width: 16 }}
            >
              <div style={{ width: 4, height: "100%", backgroundColor: accent, borderRadius: 2, boxShadow: `0 0 4px ${accent}` }} />
              <div className="absolute -top-5 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold whitespace-nowrap"
                style={{ backgroundColor: accent, color: accentText }}>
                {fmt(endSec)}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="px-3 py-1.5 text-[9px] font-mono flex items-center gap-3" style={{ backgroundColor: `color-mix(in srgb, ${bg} 92%, ${border})`, color: muted, borderTop: `1px solid color-mix(in srgb, ${border} 25%, transparent)` }}>
        <span>🎬 Vídeo</span>
        <span>🔊 Áudio {waveform ? "(real)" : "(preview)"}</span>
        <span className="hidden sm:inline">⌨️ Espaço = Play/Pause do trecho</span>
        <span className="ml-auto">Arraste as alças para ajustar o corte</span>
      </div>
    </div>
  );
}
