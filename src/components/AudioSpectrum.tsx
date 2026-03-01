import { useEffect, useRef } from "react";

interface AudioSpectrumProps {
  audioElement: HTMLAudioElement | null;
}

export default function AudioSpectrum({ audioElement }: AudioSpectrumProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!audioElement || !canvas) return;

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    const fallbackSeed = Math.random() * 1000;

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);

      const w = canvas.width;
      const h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);

      const barCount = 64;
      const barWidth = w / barCount;
      const gap = 2;
      const t = performance.now() / 350;
      const active = !audioElement.paused && !audioElement.muted;

      for (let i = 0; i < barCount; i++) {
        const wave1 = Math.sin(t + i * 0.3 + fallbackSeed) * 0.5 + 0.5;
        const wave2 = Math.sin(t * 1.7 + i * 0.5) * 0.3 + 0.5;
        const wave3 = Math.sin(t * 0.6 + i * 0.15 + 2) * 0.2 + 0.5;
        const combined = (wave1 * 0.5 + wave2 * 0.3 + wave3 * 0.2);
        const pulse = active ? 0.3 : 0.08;
        const val = pulse + combined * (active ? 0.6 : 0.12);
        const barHeight = val * h * 0.95;
        const x = i * barWidth;
        const alpha = 0.3 + val * 0.7;
        ctx2d.fillStyle = `rgba(211, 7, 7, ${alpha})`;
        ctx2d.fillRect(x + gap / 2, h - barHeight, barWidth - gap, barHeight);
      }
    };

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [audioElement]);

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
