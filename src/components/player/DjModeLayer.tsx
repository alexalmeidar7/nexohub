import { useEffect, useRef, useState } from "react";
import { getOrCreateAnalyser } from "@/components/AudioSpectrum";

/**
 * Overlay que faz o BACKGROUND piscar em cores contrastantes no ritmo da
 * música. Fica atrás do conteúdo, cobrindo o fundo original enquanto ligado.
 *
 * Estratégia:
 *  - Tenta extrair espectro via AnalyserNode e detecta onsets (spectral flux
 *    nos graves) para estimar BPM real da faixa.
 *  - Se o AudioContext não puder ser criado OU se os dados vierem zerados
 *    por N frames (comum em streams CORS que "aceitam" mas retornam silêncio),
 *    cai automaticamente para um pulso rítmico em 128 BPM.
 */

// Pares de cores altamente contrastantes (complementares/split-complementares).
// Cada par gera um degradê forte que "pisca" ao trocar.
const CONTRAST_PAIRS: Array<[string, string]> = [
  ["#ff0055", "#00e5ff"], // rosa neon x ciano
  ["#ffee00", "#7c00ff"], // amarelo x violeta
  ["#00ff85", "#ff007b"], // verde ácido x magenta
  ["#ff6a00", "#00b3ff"], // laranja x azul elétrico
  ["#39ff14", "#ff0090"], // verde neon x pink
  ["#ffffff", "#0088ff"], // branco x azul
  ["#ff2a2a", "#00ffd5"], // vermelho x turquesa
  ["#c6ff00", "#d500ff"], // lima x roxo neon
  ["#ff00ff", "#00ff66"], // magenta x verde
  ["#ffbf00", "#001aff"], // âmbar x azul cobalto
];

interface Palette {
  a: string;
  b: string;
  angle: number;
}

function randomPalette(prev?: Palette): Palette {
  let pair = CONTRAST_PAIRS[0];
  let guard = 0;
  do {
    pair = CONTRAST_PAIRS[Math.floor(Math.random() * CONTRAST_PAIRS.length)];
    guard++;
  } while (prev && pair[0] === prev.a && guard < 5);
  // 50% de chance de inverter a ordem, e ângulo aleatório para variar direção
  const flip = Math.random() > 0.5;
  return {
    a: flip ? pair[1] : pair[0],
    b: flip ? pair[0] : pair[1],
    angle: Math.floor(Math.random() * 360),
  };
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
  const paletteRef = useRef<Palette>(palette);

  const prevSpectrumRef = useRef<Float32Array | null>(null);
  const onsetTimesRef = useRef<number[]>([]);
  const bpmRef = useRef<number>(0);
  const nextBeatRef = useRef<number>(0);
  const lastOnsetRef = useRef<number>(0);
  const emaRef = useRef<number>(0);
  const silentFramesRef = useRef<number>(0);

  useEffect(() => {
    if (!active) return;
    const audio = audioRef.current;
    if (!audio) return;

    let cancelled = false;

    const triggerBeat = (energy: number) => {
      paletteRef.current = randomPalette(paletteRef.current);
      setPalette(paletteRef.current);
      setIntensity(Math.min(1, energy));
      setFlash(1);
      window.setTimeout(() => setFlash(0), 110);
    };

    const startFallback = () => {
      if (fallbackRef.current) return;
      // Pulso rítmico em 128 BPM (padrão dance/eletrônico) quando não há
      // acesso real ao áudio (CORS ou stream silencioso ao AnalyserNode).
      const interval = 60000 / 128;
      fallbackRef.current = window.setInterval(() => {
        triggerBeat(0.95);
        window.setTimeout(() => setIntensity(0.55), 180);
      }, interval);
    };

    const analyser = getOrCreateAnalyser(audio);

    if (!analyser) {
      startFallback();
      return () => {
        if (fallbackRef.current) {
          window.clearInterval(fallbackRef.current);
          fallbackRef.current = null;
        }
      };
    }

    const binCount = analyser.frequencyBinCount;
    const bins = new Uint8Array(binCount);
    const bassEnd = Math.max(4, Math.floor(binCount * 0.18));
    prevSpectrumRef.current = new Float32Array(bassEnd);

    const estimateBpm = (): number => {
      const onsets = onsetTimesRef.current;
      if (onsets.length < 6) return 0;
      const intervals: number[] = [];
      for (let i = 1; i < onsets.length; i++) intervals.push(onsets[i] - onsets[i - 1]);
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

      // Detecta stream silencioso (CORS que retorna zeros) → fallback
      let totalSum = 0;
      for (let i = 0; i < binCount; i++) totalSum += bins[i];
      if (totalSum < 4) {
        silentFramesRef.current++;
        if (silentFramesRef.current > 90) {
          // ~1.5s de silêncio total → provavelmente CORS bloqueando dados
          startFallback();
          return; // encerra o RAF, fallback assume
        }
      } else {
        silentFramesRef.current = 0;
      }

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
      const fluxThreshold = Math.max(120, emaRef.current * 1.8);

      if (flux > fluxThreshold && now - lastOnsetRef.current > 160) {
        lastOnsetRef.current = now;
        const arr = onsetTimesRef.current;
        arr.push(now);
        while (arr.length > 32 || (arr.length && now - arr[0] > 8000)) arr.shift();
        if (arr.length % 4 === 0) {
          const bpm = estimateBpm();
          if (bpm > 0) bpmRef.current = bpm;
        }
        if (bpmRef.current > 0) {
          nextBeatRef.current = now + 60000 / bpmRef.current;
        }
        triggerBeat(Math.min(1, bassAvg / 180));
      } else if (bpmRef.current > 0 && now >= nextBeatRef.current) {
        nextBeatRef.current = now + 60000 / bpmRef.current;
        triggerBeat(0.75);
      } else {
        setIntensity((p) => (p > 0.25 ? p * 0.9 : 0.25));
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (fallbackRef.current) {
        window.clearInterval(fallbackRef.current);
        fallbackRef.current = null;
      }
    };
  }, [active, audioRef]);

  if (!active) return null;

  const { a, b, angle } = palette;
  // Cobre TODO o fundo com o degradê de cores contrastantes; a intensidade
  // e o flash empurram o brilho no beat.
  const base = `linear-gradient(${angle}deg, ${a} 0%, ${b} 100%)`;
  const glow = `radial-gradient(circle at 30% 30%, ${a} 0%, transparent 55%), radial-gradient(circle at 70% 75%, ${b} 0%, transparent 55%), ${base}`;

  return (
    <>
      {/* Camada de fundo — cobre o bg original enquanto ligado */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: glow,
          opacity: 0.85 + intensity * 0.15,
          transition: "background 90ms linear, opacity 110ms ease-out",
          filter: "saturate(1.55) contrast(1.05)",
          zIndex: 0,
        }}
      />
      {/* Flash branco curto no ataque de cada beat */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "#fff",
          opacity: flash * 0.28,
          mixBlendMode: "overlay",
          transition: "opacity 100ms ease-out",
          zIndex: 1,
        }}
      />
    </>
  );
}
