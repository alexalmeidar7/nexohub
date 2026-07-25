import { useEffect, useRef, useState } from "react";
import { getOrCreateAnalyser } from "@/components/AudioSpectrum";

/**
 * Overlay que faz o fundo piscar cores neon no ritmo da música.
 * Uso ESPECÍFICO: usuário "interativa fm", programa "Pra Cima!" (áudio),
 * um programa de música eletrônica onde o VJ/DJ dita o clima visual.
 *
 * Detecção de batida: energia dos bins graves do AnalyserNode. Quando a
 * energia ultrapassa um limiar dinâmico (média móvel * fator) e passou
 * o tempo mínimo de refractário, troca a cor.
 *
 * Fallback: se o AudioContext não puder ser criado (CORS do stream, por
 * exemplo), cai num pulso baseado em timer para manter o efeito visual.
 */
const NEON_PALETTE = [
  "#ff00d4", "#00e5ff", "#ffea00", "#ff3d00", "#00ff85",
  "#7c4dff", "#ff1744", "#18ffff", "#e040fb", "#76ff03",
  "#f50057", "#00b8ff", "#ffab00", "#651fff", "#c6ff00",
];

function randomColor(prev?: string): string {
  let c = prev;
  let guard = 0;
  while (c === prev && guard++ < 5) {
    c = NEON_PALETTE[Math.floor(Math.random() * NEON_PALETTE.length)];
  }
  return c || NEON_PALETTE[0];
}

interface Palette {
  a: string;
  b: string;
  c: string;
  angle: number;
}

function randomPalette(prev?: Palette): Palette {
  const a = randomColor(prev?.a);
  const b = randomColor(a);
  let cc = randomColor(b);
  if (cc === a) cc = randomColor(a);
  return { a, b, c: cc, angle: Math.floor(Math.random() * 360) };
}

interface Props {
  audioRef: React.RefObject<HTMLAudioElement>;
  active: boolean;
}

export default function DjModeLayer({ audioRef, active }: Props) {
  const [palette, setPalette] = useState<Palette>(() => randomPalette());
  const [intensity, setIntensity] = useState<number>(0);
  const [flash, setFlash] = useState<number>(0);
  const rafRef = useRef<number | null>(null);
  const fallbackRef = useRef<number | null>(null);
  const lastBeatRef = useRef<number>(0);
  const emaRef = useRef<number>(0);
  const paletteRef = useRef<Palette>(palette);

  useEffect(() => {
    if (!active) return;
    const audio = audioRef.current;
    if (!audio) return;

    let cancelled = false;
    const analyser = getOrCreateAnalyser(audio);

    const triggerBeat = (energy: number) => {
      paletteRef.current = randomPalette(paletteRef.current);
      setPalette(paletteRef.current);
      setIntensity(Math.min(1, energy));
      setFlash(1);
      window.setTimeout(() => setFlash(0), 90);
    };

    if (!analyser) {
      fallbackRef.current = window.setInterval(() => {
        triggerBeat(0.85);
        window.setTimeout(() => setIntensity(0.4), 160);
      }, 380);
      return () => {
        if (fallbackRef.current) window.clearInterval(fallbackRef.current);
      };
    }

    const bins = new Uint8Array(analyser.frequencyBinCount);
    const bassEnd = Math.max(4, Math.floor(analyser.frequencyBinCount * 0.18));

    const loop = () => {
      if (cancelled) return;
      analyser.getByteFrequencyData(bins);
      let sum = 0;
      for (let i = 0; i < bassEnd; i++) sum += bins[i];
      const avg = sum / bassEnd;
      emaRef.current = emaRef.current * 0.92 + avg * 0.08;
      const now = performance.now();
      const threshold = Math.max(28, emaRef.current * 1.35);
      if (avg > threshold && now - lastBeatRef.current > 170) {
        lastBeatRef.current = now;
        triggerBeat(avg / 220);
      } else {
        setIntensity((prev) => (prev > 0.18 ? prev * 0.9 : 0.18));
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, audioRef]);

  if (!active) return null;

  const { a, b, c, angle } = palette;
  const gradient = `linear-gradient(${angle}deg, ${a} 0%, ${b} 50%, ${c} 100%)`;
  const glow = `radial-gradient(ellipse at 30% 30%, ${a}cc 0%, transparent 55%), radial-gradient(ellipse at 70% 70%, ${c}cc 0%, transparent 60%), ${gradient}`;

  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none z-[1]"
        style={{
          background: glow,
          opacity: 0.55 + intensity * 0.4,
          mixBlendMode: "screen",
          transition: "background 120ms linear, opacity 140ms ease-out",
          filter: "saturate(1.5)",
        }}
      />
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none z-[2]"
        style={{
          background: "#fff",
          opacity: flash * 0.18,
          mixBlendMode: "overlay",
          transition: "opacity 90ms ease-out",
        }}
      />
    </>
  );
}
