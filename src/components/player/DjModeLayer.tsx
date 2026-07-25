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
  const [color, setColor] = useState<string>(NEON_PALETTE[0]);
  const [intensity, setIntensity] = useState<number>(0);
  const rafRef = useRef<number | null>(null);
  const fallbackRef = useRef<number | null>(null);
  const lastBeatRef = useRef<number>(0);
  const emaRef = useRef<number>(0);
  const colorRef = useRef<string>(NEON_PALETTE[0]);

  useEffect(() => {
    if (!active) return;
    const audio = audioRef.current;
    if (!audio) return;

    let cancelled = false;
    const analyser = getOrCreateAnalyser(audio);

    if (!analyser) {
      // Fallback rítmico: troca a cor a cada 380ms
      fallbackRef.current = window.setInterval(() => {
        colorRef.current = randomColor(colorRef.current);
        setColor(colorRef.current);
        setIntensity(1);
        window.setTimeout(() => setIntensity(0.4), 140);
      }, 380);
      return () => {
        if (fallbackRef.current) window.clearInterval(fallbackRef.current);
      };
    }

    const bins = new Uint8Array(analyser.frequencyBinCount);
    // Analisa apenas os bins de baixa frequência (kick/bass)
    const bassEnd = Math.max(4, Math.floor(analyser.frequencyBinCount * 0.18));

    const loop = () => {
      if (cancelled) return;
      analyser.getByteFrequencyData(bins);
      let sum = 0;
      for (let i = 0; i < bassEnd; i++) sum += bins[i];
      const avg = sum / bassEnd; // 0..255
      // Média móvel exponencial (baseline dinâmico)
      emaRef.current = emaRef.current * 0.92 + avg * 0.08;
      const now = performance.now();
      const threshold = Math.max(28, emaRef.current * 1.35);
      if (avg > threshold && now - lastBeatRef.current > 170) {
        lastBeatRef.current = now;
        colorRef.current = randomColor(colorRef.current);
        setColor(colorRef.current);
        setIntensity(Math.min(1, avg / 220));
      } else {
        // decay suave
        setIntensity((prev) => (prev > 0.15 ? prev * 0.9 : 0.15));
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

  return (
    <div
      aria-hidden
      className="absolute inset-0 pointer-events-none z-[1]"
      style={{
        background: `radial-gradient(ellipse at 50% 45%, ${color} 0%, transparent 65%), linear-gradient(135deg, ${color}55 0%, transparent 70%)`,
        opacity: 0.35 + intensity * 0.45,
        mixBlendMode: "screen",
        transition: "background 90ms linear, opacity 120ms ease-out",
        filter: "saturate(1.4)",
      }}
    />
  );
}
