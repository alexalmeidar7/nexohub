import { useEffect, useRef } from "react";
import { acquireCapturedAudio } from "./capturedAudio";

export type OttSpectrumStyle = "bars" | "mirror" | "line" | "area" | "capsules";

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
    const element = media();
    let nextCapture = 0;
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
    const draw = () => {
      clearTimeout(frame);
      const playing = !!element && !element.paused && !element.ended && !document.hidden;
      if (playing) frame = setTimeout(draw, 50);
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
        } catch { /* Keep audio working even if capture is unavailable. */ }
      }
      const c = canvas.current, g = c?.getContext("2d"); if (!c || !g) return;
      g.clearRect(0, 0, c.width, c.height);
      if (analyser && bins && playing && connectedTrack) analyser.getByteFrequencyData(bins);
      else bins?.fill(0);
      c.dataset.peak = String(bins ? Math.max(...bins) : 0);
      const color = getComputedStyle(c).color;
      g.fillStyle = color; g.strokeStyle = color;
      const kind = style.current.variant;
      if (kind === "line" || kind === "area") {
        if (analyser && playing && connectedTrack) analyser.getByteTimeDomainData(wave); else wave.fill(128);
        g.beginPath();
        for (let i=0;i<wave.length;i++) {
          const x=i/(wave.length-1)*c.width,y=c.height/2+(wave[i]-128)/128*c.height*.46;
          if(i===0)g.moveTo(x,y);else g.lineTo(x,y);
        }
        if(kind==="area") {
          g.lineTo(c.width,c.height/2);g.lineTo(0,c.height/2);g.closePath();
          g.globalAlpha=.65;g.fill();g.globalAlpha=1;
        } else {g.lineWidth=2;g.stroke();}
      } else {
        const count=style.current.compact?12:kind==="capsules"?24:40,step=c.width/count;
        for(let i=0;i<count;i++) {
          const bin=Math.min((bins?.length||128)-1,Math.floor(Math.pow(128,i/(count-1))-1));
          const value=bins?bins[bin]/255:0,h=Math.max(2,value*c.height*.92),w=step*.55;
          const y=kind==="bars"?c.height-h:(c.height-h)/2;
          if(kind==="capsules" && typeof g.roundRect === "function") {g.beginPath();g.roundRect(i*step,y,w,h,w/2);g.fill();}
          else g.fillRect(i*step,y,w,h);
        }
      }
    };
    const mediaEvents = ["playing", "pause", "ended", "emptied", "loadeddata"];
    for (const event of mediaEvents) element?.addEventListener(event, draw);
    document.addEventListener("visibilitychange", draw);
    draw();
    window.addEventListener("pointerdown", resume); window.addEventListener("keydown", resume);
    return () => {
      clearTimeout(frame); window.removeEventListener("pointerdown", resume); window.removeEventListener("keydown", resume);
      for (const event of mediaEvents) element?.removeEventListener(event, draw);
      document.removeEventListener("visibilitychange", draw);
      releaseCapture(); analyser?.disconnect(); silentSink?.disconnect(); void context?.close().catch(() => {});
    };
  }, [media]);
  return <canvas ref={canvas} className={`ott-real-spectrum ${compact ? "ott-spectrum-compact" : ""}`} data-variant={variant} width={320} height={48} role="img" aria-label="Espectro do áudio da transmissão" />;
}
