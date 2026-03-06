import { useEffect, useRef } from "react";

interface AudioSpectrumProps {
  audioElement: HTMLAudioElement | null;
}

export default function AudioSpectrum({ audioElement }: AudioSpectrumProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const peaksRef = useRef<number[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!audioElement || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = 32;
    const barOffsets = Array.from({ length: bufferLength }, () => Math.random() * Math.PI * 2);
    const barSpeeds = Array.from({ length: bufferLength }, () => 0.7 + Math.random() * 1.8);

    if (peaksRef.current.length !== bufferLength) {
      peaksRef.current = new Array(bufferLength).fill(0);
    }

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);

      const w = canvas.width;
      const h = canvas.height;
      const t = performance.now() / 280;
      const active = !audioElement.paused;

      ctx.clearRect(0, 0, w, h);

      const barWidth = (w / bufferLength) * 0.8;

      for (let i = 0; i < bufferLength; i++) {
        const off = barOffsets[i];
        const spd = barSpeeds[i];
        const w1 = Math.sin(t * spd + i * 0.22 + off) * 0.5 + 0.5;
        const w2 = Math.sin(t * 1.4 * spd + i * 0.45) * 0.4 + 0.5;
        const w3 = Math.cos(t * 0.8 + i * 0.12 + off * 2) * 0.3 + 0.5;
        const spike = Math.pow(Math.sin(t * 0.5 + i * 0.08), 8) * 0.4;
        const combined = w1 * 0.35 + w2 * 0.3 + w3 * 0.2 + spike * 0.15;
        const bassBoost = i < bufferLength * 0.3 ? 1.3 : i < bufferLength * 0.6 ? 1.0 : 0.7;

        const intensity = active ? 0.85 : 0.08;
        const barHeight = Math.min(1, combined * bassBoost * intensity) * h * 0.85;

        // Peak logic
        if (barHeight > peaksRef.current[i]) {
          peaksRef.current[i] = barHeight;
        } else {
          peaksRef.current[i] -= 1.2;
          if (peaksRef.current[i] < 0) peaksRef.current[i] = 0;
        }

        const x = i * (w / bufferLength);

        // Main bar (red)
        ctx.fillStyle = `rgba(211, 7, 7, ${0.7 + (barHeight / h) * 0.3})`;
        ctx.fillRect(x, h - barHeight, barWidth, barHeight);

        // Peak marker (yellow)
        ctx.fillStyle = "rgba(254, 240, 138, 0.9)";
        ctx.fillRect(x, h - peaksRef.current[i] - 4, barWidth, 3);
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
      style={{ bottom: "130px", height: "100px" }}
    >
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}
