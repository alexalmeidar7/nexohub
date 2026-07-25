import { useEffect, useRef } from "react";
import { getOrCreateAnalyser } from "@/components/AudioSpectrum";

/**
 * DJ Mode background layer.
 *
 * Melhorias desta versão:
 *  - Pulso CONTÍNUO travado na fase do BPM (não só flash discreto): a
 *    intensidade oscila como envelope attack/decay a cada período de beat,
 *    então o fundo "respira" no ritmo mesmo entre onsets detectados.
 *  - Cores ADAPTATIVAS ao espectro: a razão energia grave / médio / agudo
 *    modula os matizes (HSL) — músicas graves puxam para quente (vermelho/
 *    laranja), agudos para frio (ciano/violeta). O par de cores muda apenas
 *    em onsets FORTES (accent), evitando "flicker" de paleta.
 *  - Detecção de onset via spectral flux (graves) com threshold adaptativo,
 *    correção de fase quando um transiente real ocorre, e estimativa de BPM
 *    por votação de intervalos (90–180 BPM).
 *  - Fallback rítmico em 128 BPM se AudioContext for bloqueado por CORS.
 *  - Render via refs (sem re-render por frame) → animação fluida em 60fps.
 */

interface Props {
  audioRef: React.RefObject<HTMLAudioElement>;
  active: boolean;
  /** 0..1 — quanto maior, mais sensível a batidas fracas (mais piscadas). Default 0.5 */
  sensitivity?: number;
}

// Curva de envelope no beat: attack rápido, decay suave.
// t = fase 0..1 do período de beat.
function beatEnvelope(t: number): number {
  if (t < 0.08) return t / 0.08;               // attack em ~8% do período
  const d = (t - 0.08) / 0.92;
  return Math.max(0, 1 - d * d * 0.92);        // decay quadrático até quase 0
}

// Converte razões de energia (bass/mid/treble) em par de matizes contrastantes.
function paletteFromSpectrum(bass: number, mid: number, treble: number, seed: number): { a: string; b: string; angle: number } {
  const total = bass + mid + treble + 0.0001;
  const bR = bass / total;
  const tR = treble / total;
  // Hue A: quente quando graves dominam (0..40°), frio quando agudos (180..260°).
  const hueA = Math.round(200 - bR * 200 + tR * 60 + (seed % 25));
  // Hue B: complementar deslocado.
  const hueB = (hueA + 150 + Math.round((mid / total) * 60)) % 360;
  const sat = 95;
  const light = 55;
  const a = `hsl(${(hueA + 360) % 360} ${sat}% ${light}%)`;
  const b = `hsl(${hueB} ${sat}% ${light}%)`;
  const angle = (seed * 47) % 360;
  return { a, b, angle };
}

export default function DjModeLayer({ audioRef, active, sensitivity = 0.5 }: Props) {
  const sensRef = useRef<number>(sensitivity);
  sensRef.current = Math.max(0, Math.min(1, sensitivity));
  const bgRef = useRef<HTMLDivElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const fallbackRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;
    const audio = audioRef.current;
    if (!audio) return;

    let cancelled = false;

    // Estado da paleta (mantido via ref para não recriar por frame)
    let paletteA = "hsl(320 95% 55%)";
    let paletteB = "hsl(190 95% 55%)";
    let paletteAngle = 45;
    let seed = Math.floor(Math.random() * 1000);

    // BPM tracking
    let bpm = 0;                        // 0 = desconhecido
    let phaseAnchor = performance.now(); // instante do último beat conhecido
    const onsetTimes: number[] = [];
    let emaFlux = 0;
    let lastOnset = 0;
    let lastAccent = 0;
    let silentFrames = 0;

    const applyPalette = (bassE: number, midE: number, trebleE: number) => {
      seed = (seed + 1 + Math.floor(Math.random() * 3)) % 10000;
      const p = paletteFromSpectrum(bassE, midE, trebleE, seed);
      paletteA = p.a;
      paletteB = p.b;
      paletteAngle = p.angle;
    };

    const flashBeat = (strength: number) => {
      const el = flashRef.current;
      if (!el) return;
      el.style.transition = "opacity 20ms linear";
      el.style.opacity = String(Math.min(0.34, 0.14 + strength * 0.25));
      window.setTimeout(() => {
        if (el) {
          el.style.transition = "opacity 180ms ease-out";
          el.style.opacity = "0";
        }
      }, 40);
    };

    const estimateBpm = (): number => {
      if (onsetTimes.length < 6) return 0;
      const intervals: number[] = [];
      for (let i = 1; i < onsetTimes.length; i++) intervals.push(onsetTimes[i] - onsetTimes[i - 1]);
      const votes = new Map<number, number>();
      for (const iv of intervals) {
        for (const mult of [1, 2, 0.5]) {
          const b = Math.round(60000 / (iv * mult));
          if (b >= 90 && b <= 180) votes.set(b, (votes.get(b) || 0) + (mult === 1 ? 2 : 1));
        }
      }
      let best = 0;
      let bestScore = 0;
      votes.forEach((score, b) => { if (score > bestScore) { bestScore = score; best = b; } });
      return best;
    };

    const startFallback = () => {
      if (fallbackRef.current) return;
      bpm = 128;
      phaseAnchor = performance.now();
      // Loop de render continua rodando via RAF abaixo, usando bpm=128.
      fallbackRef.current = window.setInterval(() => {
        applyPalette(1, 0.6, 0.4);
      }, (60000 / 128) * 4); // troca de paleta a cada 4 beats
    };

    const analyser = getOrCreateAnalyser(audio);

    // Buffers do espectro (só se houver analyser)
    let bins: Uint8Array<ArrayBuffer> | null = null;
    let prevBass: Float32Array | null = null;
    let bassEnd = 0;
    let midEnd = 0;
    if (analyser) {
      const binCount = analyser.frequencyBinCount;
      bins = new Uint8Array(new ArrayBuffer(binCount));
      bassEnd = Math.max(4, Math.floor(binCount * 0.14));
      midEnd = Math.max(bassEnd + 4, Math.floor(binCount * 0.45));
      prevBass = new Float32Array(bassEnd);
    } else {
      startFallback();
    }

    // Envelope suavizado usando lerp para render
    let renderedIntensity = 0.35;

    const loop = () => {
      if (cancelled) return;
      const now = performance.now();

      let bassE = 0.5, midE = 0.5, trebleE = 0.5;

      if (analyser && bins && prevBass) {
        analyser.getByteFrequencyData(bins);

        let total = 0;
        for (let i = 0; i < bins.length; i++) total += bins[i];
        if (total < 4) {
          silentFrames++;
          if (silentFrames > 90) {
            startFallback();
            analyser && (bins = null); // deixa fallback assumir a paleta
          }
        } else {
          silentFrames = 0;
        }

        if (bins) {
          // Energias por banda
          let bassSum = 0, midSum = 0, trebleSum = 0;
          let flux = 0;
          for (let i = 0; i < bassEnd; i++) {
            const v = bins[i];
            const d = v - prevBass[i];
            if (d > 0) flux += d;
            prevBass[i] = v;
            bassSum += v;
          }
          for (let i = bassEnd; i < midEnd; i++) midSum += bins[i];
          for (let i = midEnd; i < bins.length; i++) trebleSum += bins[i];
          bassE = bassSum / (bassEnd * 255);
          midE = midSum / ((midEnd - bassEnd) * 255);
          trebleE = trebleSum / ((bins.length - midEnd) * 255);

          emaFlux = emaFlux * 0.94 + flux * 0.06;
          const threshold = Math.max(120, emaFlux * 1.8);

          if (flux > threshold && now - lastOnset > 160) {
            lastOnset = now;
            onsetTimes.push(now);
            while (onsetTimes.length > 32 || (onsetTimes.length && now - onsetTimes[0] > 8000)) onsetTimes.shift();
            if (onsetTimes.length % 4 === 0) {
              const est = estimateBpm();
              if (est > 0) bpm = est;
            }
            // Corrige fase: alinha o próximo beat com o transiente real
            phaseAnchor = now;

            // Accent forte → troca a paleta (mas não a cada beat)
            const accentStrength = Math.min(1, flux / (threshold * 1.8));
            if (accentStrength > 0.55 && now - lastAccent > 350) {
              lastAccent = now;
              applyPalette(bassE, midE, trebleE);
            }
            flashBeat(accentStrength);
          }
        }
      }

      // === Render contínuo com envelope de beat ===
      if (bpm > 0) {
        const period = 60000 / bpm;
        const phase = ((now - phaseAnchor) % period) / period;
        const env = beatEnvelope(phase);
        // suaviza para evitar serrilhado no DOM
        renderedIntensity += (env - renderedIntensity) * 0.35;
      } else {
        renderedIntensity += (0.4 - renderedIntensity) * 0.05;
      }

      const bg = bgRef.current;
      if (bg) {
        const intensity = renderedIntensity; // 0..1
        // Sat/light modulados pela intensidade, dando "respiro" visual.
        const brightness = 0.88 + intensity * 0.28;
        bg.style.background =
          `radial-gradient(circle at 30% 30%, ${paletteA} 0%, transparent 55%),` +
          `radial-gradient(circle at 70% 75%, ${paletteB} 0%, transparent 55%),` +
          `linear-gradient(${paletteAngle}deg, ${paletteA} 0%, ${paletteB} 100%)`;
        bg.style.filter = `saturate(${1.35 + intensity * 0.5}) contrast(${1 + intensity * 0.15}) brightness(${brightness})`;
        bg.style.opacity = String(0.82 + intensity * 0.18);
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

  return (
    <>
      <div
        ref={bgRef}
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "linear-gradient(45deg, hsl(320 95% 55%), hsl(190 95% 55%))",
          opacity: 0.85,
          transition: "background 260ms linear, filter 120ms linear, opacity 140ms ease-out",
          zIndex: 0,
        }}
      />
      <div
        ref={flashRef}
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "#fff",
          opacity: 0,
          mixBlendMode: "overlay",
          zIndex: 1,
        }}
      />
    </>
  );
}
