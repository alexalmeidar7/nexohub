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
      const centerX = w / 2;
      const centerY = h / 2;
      const baseRadius = Math.min(w, h) * 0.18;
      const t = performance.now() / 280;
      const active = !audioElement.paused;

      // Trail effect
      ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
      ctx.fillRect(0, 0, w, h);

      // Simulated frequency data (math-based, avoids CORS issues)
      const dataArray = new Float32Array(bufferLength);
      for (let i = 0; i < bufferLength; i++) {
        const off = barOffsets[i];
        const spd = barSpeeds[i];
        const w1 = Math.sin(t * spd + i * 0.22 + off) * 0.5 + 0.5;
        const w2 = Math.sin(t * 1.4 * spd + i * 0.45) * 0.4 + 0.5;
        const w3 = Math.cos(t * 0.8 + i * 0.12 + off * 2) * 0.3 + 0.5;
        const spike = Math.pow(Math.sin(t * 0.5 + i * 0.08), 8) * 0.4;
        const combined = w1 * 0.35 + w2 * 0.3 + w3 * 0.2 + spike * 0.15;
        const bassBoost = i < bufferLength * 0.3 ? 1.3 : i < bufferLength * 0.6 ? 1.0 : 0.7;
        dataArray[i] = active ? Math.min(1, combined * bassBoost) : combined * 0.08;
      }

      // Draw blob
      ctx.beginPath();
      for (let i = 0; i <= bufferLength; i++) {
        const idx = i % bufferLength;
        const bump = dataArray[idx] * (active ? 80 : 12);
        const radius = baseRadius + bump;
        const rads = (Math.PI * 2 * i) / bufferLength;
        const x = centerX + Math.cos(rads) * radius;
        const y = centerY + Math.sin(rads) * radius;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      // Fill with radio red gradient
      const grad = ctx.createRadialGradient(centerX, centerY, baseRadius * 0.3, centerX, centerY, baseRadius + 80);
      grad.addColorStop(0, "rgba(211, 7, 7, 0.9)");
      grad.addColorStop(0.6, "rgba(230, 30, 30, 0.7)");
      grad.addColorStop(1, "rgba(255, 60, 60, 0.3)");
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = "rgba(255, 100, 100, 0.5)";
      ctx.lineWidth = 2;
      ctx.stroke();
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
