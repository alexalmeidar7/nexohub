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
  const emaRef = useRef<number>(0);
  const paletteRef = useRef<Palette>(palette);

  // BPM tracking state
  const prevSpectrumRef = useRef<Float32Array | null>(null);
  const onsetTimesRef = useRef<number[]>([]); // timestamps ms of detected onsets
  const bpmRef = useRef<number>(0);           // 0 = unknown yet
  const nextBeatRef = useRef<number>(0);      // predicted next beat time (ms)
  const lastOnsetRef = useRef<number>(0);

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
      // Sem acesso ao áudio (CORS): usa BPM fixo de 128 (padrão eletrônico)
      const interval = 60000 / 128;
      fallbackRef.current = window.setInterval(() => {
        triggerBeat(0.85);
        window.setTimeout(() => setIntensity(0.45), 160);
      }, interval);
      return () => {
        if (fallbackRef.current) window.clearInterval(fallbackRef.current);
      };
    }

    const binCount = analyser.frequencyBinCount;
    const bins = new Uint8Array(binCount);
    const bassEnd = Math.max(4, Math.floor(binCount * 0.18));
    prevSpectrumRef.current = new Float32Array(bassEnd);

    // Estima BPM via autocorrelação dos intervalos entre onsets recentes.
    // Faixa alvo: 90..180 BPM (dance/eletrônico). Retorna 0 se sem dados.
    const estimateBpm = (): number => {
      const onsets = onsetTimesRef.current;
      if (onsets.length < 6) return 0;
      const intervals: number[] = [];
      for (let i = 1; i < onsets.length; i++) {
        intervals.push(onsets[i] - onsets[i - 1]);
      }
      // Vote em bpm arredondado para o mais próximo (janela 90..180)
      const votes = new Map<number, number>();
      for (const iv of intervals) {
        for (const mult of [1, 2, 0.5]) {
          const bpm = Math.round(60000 / (iv * mult));
          if (bpm >= 90 && bpm <= 180) {
            votes.set(bpm, (votes.get(bpm) || 0) + (mult === 1 ? 2 : 1));
          }
        }
      }
      let best = 0;
      let bestScore = 0;
      votes.forEach((score, bpm) => {
        if (score > bestScore) {
          bestScore = score;
          best = bpm;
        }
      });
      return best;
    };

    const loop = () => {
      if (cancelled) return;
      analyser.getByteFrequencyData(bins);

      // Spectral flux nos graves — detecta transientes (kick/bass hit)
      let flux = 0;
      let bassSum = 0;
      const prev = prevSpectrumRef.current!;
      for (let i = 0; i < bassEnd; i++) {
        const v = bins[i];
        const d = v - prev[i];
        if (d > 0) flux += d;
        prev[i] = v;
        bassSum += v;
      }
      const bassAvg = bassSum / bassEnd;
      emaRef.current = emaRef.current * 0.94 + flux * 0.06;
      const now = performance.now();
      const fluxThreshold = Math.max(140, emaRef.current * 1.9);

      // Onset real detectado
      if (flux > fluxThreshold && now - lastOnsetRef.current > 160) {
        lastOnsetRef.current = now;
        // Guarda até últimos 32 onsets em janela de 8s
        const arr = onsetTimesRef.current;
        arr.push(now);
        while (arr.length > 32 || (arr.length && now - arr[0] > 8000)) arr.shift();

        // Reestima BPM ocasionalmente
        if (arr.length % 4 === 0) {
          const bpm = estimateBpm();
          if (bpm > 0) bpmRef.current = bpm;
        }

        // Corrige fase: se estamos perto do próximo beat previsto, sincroniza
        const bpm = bpmRef.current;
        if (bpm > 0) {
          const period = 60000 / bpm;
          nextBeatRef.current = now + period;
        }
        triggerBeat(Math.min(1, bassAvg / 200));
      } else if (bpmRef.current > 0 && now >= nextBeatRef.current) {
        // Beat previsto pelo BPM (mesmo sem onset forte)
        const period = 60000 / bpmRef.current;
        nextBeatRef.current = now + period;
        triggerBeat(0.7);
      } else {
        setIntensity((p) => (p > 0.2 ? p * 0.92 : 0.2));
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
