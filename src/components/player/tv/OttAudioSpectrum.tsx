import { useEffect, useRef } from "react";
import { acquireCapturedAudio } from "./capturedAudio";

export type OttSpectrumStyle = "bars" | "mirror" | "line" | "area" | "capsules" | "ribbon";

/** Analyse a captured audio track without rerouting or altering the player output. */
export default function OttAudioSpectrum({ media, compact = false, variant = "capsules" }: { media: () => HTMLMediaElement | null; compact?: boolean; variant?: OttSpectrumStyle }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const style = useRef({variant,compact}); style.current = {variant,compact};
  useEffect(() => {
    let frame: ReturnType<typeof setTimeout> | undefined;
    let context: AudioContext | null = null;
    let captureLease: ReturnType<typeof acquireCapturedAudio> = null;
    let stream: MediaStream | null = null, source: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let silentSink: GainNode | null = null;
    let element: HTMLMediaElement | null = null;
    let color = "";
    const mediaEvents = ["playing", "pause", "ended", "emptied", "loadeddata"];
    let nextCapture = performance.now() + 450;
    let bins: Uint8Array<ArrayBuffer> | null = null;
    const wave = new Uint8Array(256);
    let connectedTrack: MediaStreamTrack | null = null;
    const resume = () => { if (context?.state === "suspended") void context.resume().catch(() => {}); };
    const connect = () => {
      if (!stream || !context) return;
      const track = stream.getAudioTracks().find(candidate => candidate.readyState === "live") ?? null;
      if(track===connectedTrack&&source)return;
      source?.disconnect(); source=null;connectedTrack=track;
      if(!track)return;
      try {
        source = context.createMediaStreamSource(new MediaStream([track]));
        if (!analyser) {
          analyser = context.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = .75;
          // Android WebView may stop pulling a graph with no output. A muted
          // branch keeps analysis active while the media element owns playback.
          silentSink = context.createGain();
          silentSink.gain.value = 0;
          analyser.connect(silentSink);
          silentSink.connect(context.destination);
        }
        source.connect(analyser); bins = new Uint8Array(analyser.frequencyBinCount); resume();
      } catch { /* Unsupported capture stays flat; playback is never rerouted. */ }
    };
    const releaseCapture = () => {
      stream?.removeEventListener("addtrack", connect);
      stream?.removeEventListener("removetrack", connect);
      source?.disconnect(); source = null; connectedTrack = null;
      captureLease?.release(); captureLease = null; stream = null;
    };
    // NEXO_CAPA_CORACAO_ESPECTRO_V1: auto-gain suave apenas com amostras reais.
    // Nao inventa movimento quando o audio nao fornece dados capturaveis.
    const smoothedLevels = new Float32Array(50);

    const draw = () => {
      clearTimeout(frame);
      const next = media();
      if (next !== element) {
        for (const event of mediaEvents) element?.removeEventListener(event, draw);
        releaseCapture(); element = next; nextCapture = performance.now() + 450; smoothedLevels.fill(0);
        for (const event of mediaEvents) element?.addEventListener(event, draw);
      }
      const playing = !!element && !element.paused && !element.ended && !document.hidden;
      if (!document.hidden) frame = setTimeout(draw, playing ? 66 : 500);
      const now = performance.now();
      if (playing && element.readyState >= 2 && (!stream || !connectedTrack || connectedTrack.readyState === "ended") && now >= nextCapture) {
        nextCapture = now + 2000;
        if (stream && !stream.active) releaseCapture();
        try {
          if (!stream) {
            context ??= new AudioContext();
            captureLease = acquireCapturedAudio(element);
            stream = captureLease?.stream ?? null;
            stream?.addEventListener("addtrack", connect);
            stream?.addEventListener("removetrack", connect);
          }
          connect();
        } catch { /* Nao altera a saida de audio quando a captura esta indisponivel. */ }
      }
      const c = canvas.current, g = c?.getContext("2d"); if (!c || !g || document.hidden) return;
      g.clearRect(0, 0, c.width, c.height);
      if (analyser && bins && playing && connectedTrack) analyser.getByteFrequencyData(bins);
      else bins?.fill(0);
      const peak = bins ? Math.max(...bins) : 0;
      if (!color) color = getComputedStyle(c).color;
      g.fillStyle = color; g.strokeStyle = color;
      const kind = style.current.variant;
      if (kind === "line" || kind === "area") {
        if (analyser && playing && connectedTrack) analyser.getByteTimeDomainData(wave); else wave.fill(128);
        g.beginPath();
        for (let i = 0; i < wave.length; i++) {
          const x = i / (wave.length - 1) * c.width;
          const y = c.height / 2 + (wave[i] - 128) / 128 * c.height * .48;
          if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        if (kind === "area") {
          g.lineTo(c.width, c.height / 2); g.lineTo(0, c.height / 2); g.closePath();
          g.globalAlpha = .65; g.fill(); g.globalAlpha = 1;
        } else { g.lineWidth = 2.5; g.stroke(); }
      } else {
        const count = style.current.compact ? 14 : kind === "capsules" ? 32 : 43;
        const step = c.width / count;
        const gain = peak > 0 ? Math.min(2.7, Math.max(1.12, 172 / peak)) : 1;
        for (let i = 0; i < count; i++) {
          const first = bins?.length ? Math.floor(Math.pow(i / count, 1.65) * bins.length) : 0;
          const last = bins?.length ? Math.max(first + 1, Math.ceil(Math.pow((i + 1) / count, 1.65) * bins.length)) : 1;
          let energy = 0;
          let maximum = 0;
          if (bins) for (let j = first; j < Math.min(last, bins.length); j++) {
            energy += bins[j]; maximum = Math.max(maximum, bins[j]);
          }
          const average = bins ? energy / Math.max(1, Math.min(last, bins.length) - first) : 0;
          const signal = bins && playing ? Math.min(1, Math.pow(((average * .70 + maximum * .30) / 255) * gain, .85)) : 0;
          // Ataque rapido, queda gradual: acompanha ritmos sem barras congeladas.
          const previous = smoothedLevels[i];
          const smoothing = signal > previous ? .62 : .23;
          const level = smoothedLevels[i] = playing ? previous + (signal - previous) * smoothing : 0;
          const height = Math.max(kind === "bars" ? 2 : 3, Math.min(c.height * .94, level * c.height * .94));
          const barWidth = step * (kind === "ribbon" ? .48 : kind === "capsules" ? .58 : .70);
          const x = i * step + (step - barWidth) / 2;
          const y = kind === "bars" ? c.height - height : (c.height - height) / 2;
          if ((kind === "capsules" || kind === "ribbon") && typeof g.roundRect === "function") {
            g.beginPath(); g.roundRect(x, y, barWidth, height, Math.min(barWidth / 2, height / 2)); g.fill();
          } else g.fillRect(x, y, barWidth, height);
        }
      }
    };
    const invalidateColor = () => { color = ""; };
    const themeObserver = new MutationObserver(invalidateColor);
    const tvRoot = canvas.current?.closest(".nexo-tv");
    if (tvRoot) themeObserver.observe(tvRoot, {attributes:true, attributeFilter:["style","class"]});
    document.addEventListener("visibilitychange", draw);
    draw();
    window.addEventListener("pointerdown", resume); window.addEventListener("keydown", resume);
    return () => {
      themeObserver.disconnect(); clearTimeout(frame); window.removeEventListener("pointerdown", resume); window.removeEventListener("keydown", resume);
      for (const event of mediaEvents) element?.removeEventListener(event, draw);
      document.removeEventListener("visibilitychange", draw);
      releaseCapture(); analyser?.disconnect(); silentSink?.disconnect(); void context?.close().catch(() => {});
    };
  }, [media]);
  return <canvas ref={canvas} className={`ott-real-spectrum ${compact ? "ott-spectrum-compact" : ""} ${variant === "ribbon" ? "ott-spectrum-ribbon" : ""}`} data-variant={variant} width={variant === "ribbon" ? 420 : 320} height={variant === "ribbon" ? 96 : 48} role="img" aria-label="Espectro do áudio da transmissão" />;
}
