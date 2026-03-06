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

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = 64;
    const barOffsets = Array.from({ length: bufferLength }, () => Math.random() * Math.PI * 2);
    const barSpeeds = Array.from({ length: bufferLength }, () => 0.7 + Math.random() * 1.8);

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);

      const w = canvas.width;
      const h = canvas.height;
      const centerY = h / 2;
      const t = performance.now() / 280;
      const active = !audioElement.paused;

      ctx.fillStyle = "rgba(0, 0, 0, 0.35)";
      ctx.fillRect(0, 0, w, h);

      const barWidth = w / bufferLength;

      for (let i = 0; i < bufferLength; i++) {
        const off = barOffsets[i];
        const spd = barSpeeds[i];
        const w1 = Math.sin(t * spd + i * 0.22 + off) * 0.5 + 0.5;
        const w2 = Math.sin(t * 1.4 * spd + i * 0.45) * 0.4 + 0.5;
        const w3 = Math.cos(t * 0.8 + i * 0.12 + off * 2) * 0.3 + 0.5;
        const spike = Math.pow(Math.sin(t * 0.5 + i * 0.08), 8) * 0.4;
        const combined = w1 * 0.35 + w2 * 0.3 + w3 * 0.2 + spike * 0.15;
        const bassBoost = i < bufferLength * 0.3 ? 1.3 : i < bufferLength * 0.6 ? 1.0 : 0.7;

        const intensity = active ? 0.8 : 0.08;
        const val = Math.min(1, combined * bassBoost * intensity);
        const barHeight = val * (h / 2) * 0.85;

        const x = i * barWidth;

        // Red gradient per bar
        const r = 211 + Math.round(val * 44);
        const g = 7 + Math.round(val * 23);
        const b = 7 + Math.round(val * 53);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.6 + val * 0.4})`;

        // Draw symmetrically from center
        ctx.fillRect(x + 1, centerY - barHeight, barWidth - 2, barHeight * 2);
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
