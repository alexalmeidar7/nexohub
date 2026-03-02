import { useEffect, useRef } from "react";

interface AudioSpectrumProps {
  audioElement: HTMLAudioElement | null;
}

// Cache the AudioContext and source node globally to avoid re-creating
let sharedAudioCtx: AudioContext | null = null;
let sharedSourceNode: MediaElementAudioSourceNode | null = null;
let sharedAnalyser: AnalyserNode | null = null;
let connectedElement: HTMLAudioElement | null = null;

export default function AudioSpectrum({ audioElement }: AudioSpectrumProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const webAudioReady = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!audioElement || !canvas) return;

    const ctx2d = canvas.getContext("2d");
    if (!ctx2d) return;

    // Try to connect Web Audio API
    try {
      if (!sharedAudioCtx) {
        sharedAudioCtx = new AudioContext();
      }
      if (connectedElement !== audioElement) {
        sharedSourceNode = sharedAudioCtx.createMediaElementSource(audioElement);
        sharedAnalyser = sharedAudioCtx.createAnalyser();
        sharedAnalyser.fftSize = 256;
        sharedAnalyser.smoothingTimeConstant = 0.7;
        sharedSourceNode.connect(sharedAnalyser);
        sharedAnalyser.connect(sharedAudioCtx.destination);
        connectedElement = audioElement;
      }
      webAudioReady.current = true;
    } catch {
      webAudioReady.current = false;
    }

    const bufferLength = sharedAnalyser?.frequencyBinCount || 128;
    const dataArray = new Uint8Array(bufferLength);

    // Fallback procedural animation data
    const seed = Math.random() * 1000;
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
      const active = !audioElement.paused;

      if (webAudioReady.current && sharedAnalyser) {
        // Resume context if suspended (autoplay policy)
        if (sharedAudioCtx?.state === "suspended") sharedAudioCtx.resume();
        
        sharedAnalyser.getByteFrequencyData(dataArray);

        for (let i = 0; i < barCount; i++) {
          // Map bar index to frequency bin (logarithmic distribution for better visual)
          const freqIndex = Math.floor(Math.pow(i / barCount, 1.5) * (bufferLength - 1));
          const rawVal = dataArray[freqIndex] / 255;
          
          // Smooth and amplify
          const val = active ? Math.max(0.03, rawVal * 1.2) : 0.03;
          const barHeight = val * h;
          const x = i * barWidth;

          const gradient = ctx2d.createLinearGradient(x, h, x, h - barHeight);
          gradient.addColorStop(0, `rgba(211, 7, 7, ${0.9 * val})`);
          gradient.addColorStop(0.5, `rgba(230, 30, 30, ${0.7 * val})`);
          gradient.addColorStop(1, `rgba(255, 60, 60, ${0.4 * val})`);

          ctx2d.fillStyle = gradient;
          ctx2d.fillRect(x + gap / 2, h - barHeight, barWidth - gap, barHeight);
        }
      } else {
        // Fallback: procedural animation
        const t = performance.now() / 280;
        for (let i = 0; i < barCount; i++) {
          const off = barOffsets[i];
          const spd = barSpeeds[i];
          const w1 = Math.sin(t * spd + i * 0.22 + off) * 0.5 + 0.5;
          const w2 = Math.sin(t * 1.4 * spd + i * 0.45 + seed) * 0.4 + 0.5;
          const w3 = Math.cos(t * 0.8 + i * 0.12 + off * 2) * 0.3 + 0.5;
          const w4 = Math.sin(t * 2.2 + i * 0.7 + seed * 0.5) * 0.25 + 0.5;
          const spike = Math.pow(Math.sin(t * 0.5 + i * 0.08), 8) * 0.4;
          const combined = w1 * 0.3 + w2 * 0.25 + w3 * 0.2 + w4 * 0.15 + spike * 0.1;
          const bassBoost = i < barCount * 0.3 ? 1.3 : i < barCount * 0.6 ? 1.0 : 0.7;
          const base = active ? 0.15 : 0.04;
          const intensity = active ? 0.85 : 0.08;
          const val = Math.min(1, (base + combined * intensity) * bassBoost);
          const barHeight = val * h;
          const x = i * barWidth;

          const gradient = ctx2d.createLinearGradient(x, h, x, h - barHeight);
          gradient.addColorStop(0, `rgba(211, 7, 7, ${0.9 * val})`);
          gradient.addColorStop(0.5, `rgba(230, 30, 30, ${0.7 * val})`);
          gradient.addColorStop(1, `rgba(255, 60, 60, ${0.4 * val})`);

          ctx2d.fillStyle = gradient;
          ctx2d.fillRect(x + gap / 2, h - barHeight, barWidth - gap, barHeight);
        }
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
