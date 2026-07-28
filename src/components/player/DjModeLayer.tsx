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
  /** Paleta da capa (hex) — fallback quando não há triad. */
  coverPalette?: { primary: string; secondary: string } | null;
  /** Tríade de 3 cores amostradas de pontos da capa (preferida no Modo DJ). */
  coverTriad?: { a: string; b: string; c: string } | null;
  /** Mostra HUD com BPM e "temperatura" (frias/intermediárias/quentes). Default false. */
  showHud?: boolean;
}



// Curva de envelope no beat: attack rápido, decay suave.
// t = fase 0..1 do período de beat.
function beatEnvelope(t: number): number {
  if (t < 0.08) return t / 0.08;               // attack em ~8% do período
  const d = (t - 0.08) / 0.92;
  return Math.max(0, 1 - d * d * 0.92);        // decay quadrático até quase 0
}

// ---- Utilidades HSL ----
function hexToHsl(hex: string): { h: number; s: number; l: number } | null {
  const m = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(m) && !/^[0-9a-fA-F]{3}$/.test(m)) return null;
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * Gera par de cores considerando:
 *  - BPM: lento (< 110) → cores FRIAS contrastantes; rápido (> 132) → VIBRANTES quentes/saturadas.
 *  - Espectro (bass/mid/treble): puxa matiz secundário conforme energia.
 *  - Paleta da CAPA: um dos matizes é sempre "ancorado" na capa (mistura visual com a música).
 */
function paletteFromContext(
  bpm: number,
  bass: number,
  mid: number,
  treble: number,
  coverHue: number | null,
  seed: number,
): { a: string; b: string; angle: number } {
  const total = bass + mid + treble + 0.0001;
  const bR = bass / total;
  const tR = treble / total;

  // tempo: 0 = lento, 1 = rápido (mapeia 90..160 BPM)
  const tempo = bpm > 0 ? Math.max(0, Math.min(1, (bpm - 90) / 70)) : 0.5;

  // Cor A: ancorada na capa (se houver), com leve variação pelo seed.
  // Sem capa, usa matiz derivado do espectro.
  const spectrumHue = 200 - bR * 200 + tR * 60;
  const anchorHue = coverHue != null
    ? (coverHue + ((seed % 21) - 10)) % 360
    : spectrumHue + (seed % 25);

  // Cor B: contraste que depende do tempo.
  //  - Lento: puxa para FRIO (180..260°) e complementa a capa.
  //  - Rápido: complementar quente/vibrante (0..40° ou 300..340°).
  let contrastHue: number;
  if (tempo < 0.35) {
    // Frio contrastante — força faixa cyan/azul/violeta
    const coolBase = 190 + (seed % 60); // 190..250
    // se a capa já for fria, aumenta distância; se quente, complementa
    const delta = coverHue != null ? Math.abs(((coverHue - coolBase + 540) % 360) - 180) : 180;
    contrastHue = delta < 40 ? (coolBase + 45) % 360 : coolBase;
  } else if (tempo > 0.6) {
    // Quente vibrante — força faixa rosa/laranja/amarelo
    const hotBase = (seed * 37) % 60; // 0..60 (vermelho→amarelo)
    contrastHue = Math.random() > 0.5 ? hotBase : (320 + (seed % 40)) % 360;
  } else {
    // Meio termo: complementar clássico deslocado pela energia média
    contrastHue = (anchorHue + 150 + (mid / total) * 60) % 360;
  }

  // Saturação e luminância dependem do tempo: mais vibrante quanto mais rápido.
  const sat = Math.round(70 + tempo * 28);           // 70..98%
  const light = Math.round(48 + (1 - tempo) * 10);   // 48..58%

  const a = `hsl(${((anchorHue % 360) + 360) % 360} ${Math.min(96, sat)}% ${light}%)`;
  const b = `hsl(${((contrastHue % 360) + 360) % 360} ${sat}% ${light}%)`;
  const angle = (seed * 47) % 360;
  return { a, b, angle };
}

export default function DjModeLayer({ audioRef, active, sensitivity = 0.5, coverPalette = null, coverTriad = null, showHud = false }: Props) {
  const sensRef = useRef<number>(sensitivity);
  sensRef.current = Math.max(0, Math.min(1, sensitivity));
  const coverHueRef = useRef<number | null>(null);
  coverHueRef.current = (() => {
    if (coverTriad?.a) {
      const hsl = hexToHsl(coverTriad.a);
      if (hsl) return hsl.h;
    }
    if (!coverPalette?.primary) return null;
    const hsl = hexToHsl(coverPalette.primary);
    return hsl ? hsl.h : null;
  })();

  const bgRef = useRef<HTMLDivElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const fallbackRef = useRef<number | null>(null);
  const bpmRef = useRef<number>(0);
  const coverTriadRef = useRef<{ a: string; b: string; c: string } | null>(coverTriad ?? null);
  coverTriadRef.current = coverTriad ?? null;


  useEffect(() => {
    if (!active) return;
    const audio = audioRef.current;
    if (!audio) return;

    let cancelled = false;

    // Estado da paleta (mantido via ref para não recriar por frame)
    let paletteA = "hsl(320 95% 55%)";
    let paletteB = "hsl(190 95% 55%)";
    let paletteC = "hsl(260 95% 55%)";
    let paletteAngle = 45;
    let seed = Math.floor(Math.random() * 1000);

    const hasTriad = !!coverTriadRef.current?.a && !!coverTriadRef.current?.b && !!coverTriadRef.current?.c;



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
      if (hasTriad) {
        const triad = coverTriadRef.current!;
        paletteA = triad.a;
        paletteB = triad.b;
        paletteC = triad.c;
        paletteAngle = (seed * 47) % 360;
      } else {
        const p = paletteFromContext(bpm || bpmRef.current, bassE, midE, trebleE, coverHueRef.current, seed);
        paletteA = p.a;
        paletteB = p.b;
        paletteAngle = p.angle;
      }
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
      bpmRef.current = 128;
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
          // Sensibilidade: 0 = conservador (só picos fortes), 1 = agressivo.
          const s = sensRef.current;
          // Threshold multiplier: 2.6 (baixa sens) → 1.1 (alta sens)
          const thrMul = 2.6 - s * 1.5;
          // Base mínima: 180 (baixa) → 60 (alta) — permite pegar batidas fracas
          const thrBase = 180 - s * 120;
          const threshold = Math.max(thrBase, emaFlux * thrMul);
          // Gap mínimo entre onsets: 220ms (baixa) → 110ms (alta)
          const minGap = 220 - s * 110;

          if (flux > threshold && now - lastOnset > minGap) {
            lastOnset = now;
            onsetTimes.push(now);
            while (onsetTimes.length > 32 || (onsetTimes.length && now - onsetTimes[0] > 8000)) onsetTimes.shift();
            if (onsetTimes.length % 4 === 0) {
              const est = estimateBpm();
              if (est > 0) { bpm = est; bpmRef.current = est; }
            }
            // Corrige fase: alinha o próximo beat com o transiente real
            phaseAnchor = now;

            // Accent forte → troca a paleta (mais frequente com sens alta)
            const accentStrength = Math.min(1, flux / (threshold * 1.8));
            const accentCut = 0.75 - s * 0.35; // 0.75 → 0.40
            const accentGap = 500 - s * 250;    // 500ms → 250ms
            if (accentStrength > accentCut && now - lastAccent > accentGap) {
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
          `radial-gradient(circle at 50% 100%, ${paletteC} 0%, transparent 60%),` +
          `linear-gradient(${paletteAngle}deg, ${paletteA} 0%, ${paletteC} 50%, ${paletteB} 100%)`;

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
          background: "linear-gradient(45deg, hsl(320 95% 55%), hsl(260 95% 55%), hsl(190 95% 55%))",
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
