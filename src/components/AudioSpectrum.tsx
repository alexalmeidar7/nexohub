import { useEffect, useRef } from "react";

interface AudioSpectrumProps {
  audioElement: HTMLAudioElement | null;
}

type SpectrumAudioState = {
  ctx: AudioContext;
  analyser: AnalyserNode;
};

const spectrumStateMap = new WeakMap<HTMLAudioElement, SpectrumAudioState>();

function createSpectrumState(audio: HTMLAudioElement): SpectrumAudioState | null {
  const media = audio as HTMLMediaElement & {
    captureStream?: () => MediaStream;
    mozCaptureStream?: () => MediaStream;
  };

  const stream = media.captureStream?.() ?? media.mozCaptureStream?.();
  if (!stream) return null;

  const ctx = new (window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 256;
  analyser.smoothingTimeConstant = 0.75;

  // IMPORTANT: use MediaStreamSource so we do not reroute/replace the original audio output
  const source = ctx.createMediaStreamSource(stream);
  source.connect(analyser);

  return { ctx, analyser };
}

export default function AudioSpectrum({ audioElement }: AudioSpectrumProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!audioElement || !canvas) return;

    let state = spectrumStateMap.get(audioElement) ?? null;
    if (!state) {
      state = createSpectrumState(audioElement);
      if (state) spectrumStateMap.set(audioElement, state);
    }

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

      if (state) {
        if (state.ctx.state === "suspended") {
          state.ctx.resume().catch(() => {});
        }

        const bufferLength = state.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        state.analyser.getByteFrequencyData(dataArray);

        for (let i = 0; i < barCount; i++) {
          const srcIndex = Math.floor((i / barCount) * bufferLength);
          const val = dataArray[srcIndex] / 255;
          const barHeight = val * h * 0.95;
          const x = i * barWidth;
          const alpha = 0.35 + val * 0.65;
          ctx2d.fillStyle = `rgba(211, 7, 7, ${alpha})`;
          ctx2d.fillRect(x + gap / 2, h - barHeight, barWidth - gap, barHeight);
        }
      } else {
        // Safe fallback animation if stream capture is unavailable (does not touch audio pipeline)
        const t = performance.now() / 380;
        const active = !audioElement.paused && !audioElement.muted;

        for (let i = 0; i < barCount; i++) {
          const wave = Math.sin(t + i * 0.35 + fallbackSeed) * 0.5 + 0.5;
          const pulse = active ? 0.35 : 0.12;
          const val = pulse + wave * (active ? 0.55 : 0.18);
          const barHeight = val * h * 0.9;
          const x = i * barWidth;
          const alpha = 0.25 + val * 0.6;
          ctx2d.fillStyle = `rgba(211, 7, 7, ${alpha})`;
          ctx2d.fillRect(x + gap / 2, h - barHeight, barWidth - gap, barHeight);
        }
      }
    };

    draw();

    return () => {
      cancelAnimationFrame(rafRef.current);
    };
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
