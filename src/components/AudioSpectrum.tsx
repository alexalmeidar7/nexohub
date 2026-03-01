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

    const seed = Math.random() * 1000;
    // Random per-bar offsets for organic feel
    const barOffsets = Array.from({ length: 80 }, () => Math.random() * Math.PI * 2);
    const barSpeeds = Array.from({ length: 80 }, () => 0.7 + Math.random() * 1.8);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);

      const w = canvas.width;
      const h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);

      const barCount = 80;
      const barWidth = w / barCount;
      const gap = 1.5;
      const t = performance.now() / 280;
      const active = !audioElement.paused && !audioElement.muted;

      for (let i = 0; i < barCount; i++) {
        const off = barOffsets[i];
        const spd = barSpeeds[i];

        // Multiple layered waves for realism
        const w1 = Math.sin(t * spd + i * 0.22 + off) * 0.5 + 0.5;
        const w2 = Math.sin(t * 1.4 * spd + i * 0.45 + seed) * 0.4 + 0.5;
        const w3 = Math.cos(t * 0.8 + i * 0.12 + off * 2) * 0.3 + 0.5;
        const w4 = Math.sin(t * 2.2 + i * 0.7 + seed * 0.5) * 0.25 + 0.5;
        const spike = Math.pow(Math.sin(t * 0.5 + i * 0.08), 8) * 0.4;

        const combined = w1 * 0.3 + w2 * 0.25 + w3 * 0.2 + w4 * 0.15 + spike * 0.1;

        // Bass-heavy distribution (lower bars = higher amplitude)
        const bassBoost = i < barCount * 0.3 ? 1.3 : i < barCount * 0.6 ? 1.0 : 0.7;

        const base = active ? 0.15 : 0.04;
        const intensity = active ? 0.85 : 0.08;
        const val = Math.min(1, (base + combined * intensity) * bassBoost);
        const barHeight = val * h;
        const x = i * barWidth;

        // Gradient per bar
        const gradient = ctx2d.createLinearGradient(x, h, x, h - barHeight);
        gradient.addColorStop(0, `rgba(211, 7, 7, ${0.9 * val})`);
        gradient.addColorStop(0.5, `rgba(230, 30, 30, ${0.7 * val})`);
        gradient.addColorStop(1, `rgba(255, 60, 60, ${0.4 * val})`);

        ctx2d.fillStyle = gradient;
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
    <div
      className="absolute left-0 right-0 z-[1] pointer-events-none"
      style={{ bottom: "120px", height: "150px" }}
    >
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
