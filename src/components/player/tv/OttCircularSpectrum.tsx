import { useEffect, useRef } from "react";
import { acquireCapturedAudio } from "./capturedAudio";

/**
 * Espectro circular compacto da HOME. Usa apenas as cores da emissora e branco.
 * A captura analisa a faixa sem redirecionar a saída do player.
 */
export default function OttCircularSpectrum({ media }: { media: () => HTMLMediaElement | null }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const graphics = canvas.getContext("2d");
    if (!graphics) return;

    let timer: ReturnType<typeof setTimeout> | undefined;
    let observed: HTMLMediaElement | null = null;
    const events = ["playing","pause","ended","loadeddata","emptied"];
    let lastAttempt = -3000;
    let audioContext: AudioContext | null = null;
    let captureLease: ReturnType<typeof acquireCapturedAudio> = null;
    let stream: MediaStream | null = null;
    let streamSource: MediaStreamAudioSourceNode | null = null;
    let analyser: AnalyserNode | null = null;
    let silentOutput: GainNode | null = null;
    let connectedTrack: MediaStreamTrack | null = null;
    let frequencyBins: Uint8Array<ArrayBuffer> | null = null;

    const releaseCapture = () => {
      streamSource?.disconnect();
      streamSource = null;
      connectedTrack = null;
      captureLease?.release();
      captureLease = null;
      stream = null;
    };
    const connect = () => {
      if (!stream || !audioContext) return;
      const track = stream.getAudioTracks().find(item => item.readyState === "live") ?? null;
      if (!track || (connectedTrack === track && streamSource)) return;
      streamSource?.disconnect();
      streamSource = null;
      connectedTrack = track;
      try {
        streamSource = audioContext.createMediaStreamSource(new MediaStream([track]));
        if (!analyser) {
          analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.82;
          silentOutput = audioContext.createGain();
          silentOutput.gain.value = 0;
          analyser.connect(silentOutput);
          silentOutput.connect(audioContext.destination);
        }
        streamSource.connect(analyser);
        frequencyBins = new Uint8Array(analyser.frequencyBinCount);
        if (audioContext.state === "suspended") void audioContext.resume().catch(() => {});
      } catch {
        // Sem suporte à captura, o espectro usa movimento visual discreto.
      }
    };

    const attemptCapture = (element: HTMLMediaElement, now: number) => {
      if (now - lastAttempt < 2500) return;
      lastAttempt = now;
      if (stream && stream.active && connectedTrack?.readyState === "live") return;
      try {
        if (stream && !stream.active) releaseCapture();
        if (!stream) {
          captureLease = acquireCapturedAudio(element);
          stream = captureLease?.stream ?? null;
        }
        if (!stream) return;
        audioContext ??= new AudioContext();
        connect();
      } catch {
        // A ausência de captura não deve pausar ou bloquear a rádio.
      }
    };

    const draw = () => {
      clearTimeout(timer);
      if (document.hidden) return;
      const now = performance.now();
      const element = media();
      if (element !== observed) {
        events.forEach(event => observed?.removeEventListener(event, draw));
        releaseCapture(); observed = element;
        events.forEach(event => observed?.addEventListener(event, draw));
        lastAttempt = -3000;
      }
      const playing = !!element && !element.paused && !element.ended && element.readyState > 1;
      timer = setTimeout(draw, playing ? 80 : 500);
      if (playing && element) attemptCapture(element, now);
      if (playing && analyser && frequencyBins && connectedTrack?.readyState === "live") {
        analyser.getByteFrequencyData(frequencyBins);
      } else frequencyBins?.fill(0);

      const width = 112;
      const height = 112;
      graphics.clearRect(0, 0, width, height);
      
      // Somente a cor institucional configurada no House Mix.

      const realSignal = !!(playing && analyser && frequencyBins && connectedTrack);
      const energy = (index: number) => {
        if (realSignal && frequencyBins) {
          const bin = Math.min(frequencyBins.length - 1, Math.floor(index / 62 * (frequencyBins.length - 1)));
          return frequencyBins[bin] / 255;
        }
        return 0; // Do not simulate signal when capture is unavailable.
      };

      graphics.save();
      graphics.translate(width / 2, height / 2);
      graphics.strokeStyle = "#fff"; graphics.lineWidth = 5; graphics.lineCap = "round";
      const shape = [.2,.35,.55,.8,1,.8,.55,.35,.2];
      for(let i=0;i<9;i++){
        const e=energy(i*7); const length=playing? 7+48*shape[i]*Math.max(.12,e):5;
        const x=(i-4)*9; graphics.beginPath(); graphics.moveTo(x,-length/2);graphics.lineTo(x,length/2);graphics.stroke();
      }
      graphics.restore();
    };

    document.addEventListener("visibilitychange", draw);
    draw();
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", draw);
      events.forEach(event => observed?.removeEventListener(event, draw));
      releaseCapture();
      analyser?.disconnect();
      silentOutput?.disconnect();
      if (audioContext) void audioContext.close().catch(() => {});
    };
  }, [media]);

  return <canvas ref={canvasRef} className="ott-circular-spectrum" width={112} height={112} role="img" aria-label="Visualizador compacto do áudio" />;
}
