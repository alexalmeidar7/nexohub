import { useEffect, useRef } from "react";

interface AudioSpectrumProps {
  audioRef: React.RefObject<HTMLAudioElement>;
}

export default function AudioSpectrum({ audioRef }: AudioSpectrumProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<{ analyser: AnalyserNode; source: MediaElementAudioSourceNode } | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const audio = audioRef.current;
    const canvas = canvasRef.current;
    if (!audio || !canvas) return;

    // Only create the audio context once per audio element
    if (!ctxRef.current) {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        const source = audioCtx.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(audioCtx.destination);
        ctxRef.current = { analyser, source };
      } catch {
        return;
      }
    }

    const { analyser } = ctxRef.current;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const w = canvas.width;
      const h = canvas.height;

      analyser.getByteFrequencyData(dataArray);
      ctx.clearRect(0, 0, w, h);

      const barCount = Math.min(bufferLength, 64);
      const barWidth = w / barCount;
      const gap = 2;

      for (let i = 0; i < barCount; i++) {
        const val = dataArray[i] / 255;
        const barHeight = val * h * 0.9;
        const x = i * barWidth;
        // Gradient from bottom
        const alpha = 0.4 + val * 0.6;
        ctx.fillStyle = `rgba(211, 7, 7, ${alpha})`;
        ctx.fillRect(x + gap / 2, h - barHeight, barWidth - gap, barHeight);
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
  }, [audioRef]);

  // Resize canvas to container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const parent = canvas.parentElement;
      if (parent) {
        canvas.width = parent.clientWidth;
        canvas.height = parent.clientHeight;
      }
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return (
    <div className="absolute bottom-0 left-0 right-0 z-[5] pointer-events-none" style={{ height: "120px" }}>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
