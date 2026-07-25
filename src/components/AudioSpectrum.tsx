import { useEffect, useRef, useState, useCallback } from "react";
import { Settings2 } from "lucide-react";

export type SpectrumStyle = "bars" | "wave" | "circular" | "off";

interface AudioSpectrumProps {
  audioElement: HTMLAudioElement | null;
  barColor?: string;
  style?: SpectrumStyle;
  showConfig?: boolean;
  onStyleChange?: (style: SpectrumStyle) => void;
}

function resolveColor(barColor?: string): string {
  let c = barColor || "var(--layout-accent-color)";
  if (c.startsWith("var(")) {
    const match = c.match(/var\(([^,)]+)/);
    if (match) {
      const computed = getComputedStyle(document.documentElement).getPropertyValue(match[1]).trim();
      if (computed) c = computed;
    }
  }
  return c && c !== "" ? c : "rgba(255,255,255,0.6)";
}

// ── Web Audio API helper — shared context to avoid multiple connections ──
const audioCtxMap = new WeakMap<HTMLAudioElement, { ctx: AudioContext; analyser: AnalyserNode; source: MediaElementAudioSourceNode }>();

export function getOrCreateAnalyser(audio: HTMLAudioElement): AnalyserNode | null {
  try {
    // Segurança CRÍTICA: createMediaElementSource desvia o áudio do <audio>
    // nativo para o grafo Web Audio. Se o stream for cross-origin SEM CORS
    // (crossOrigin não setado como "anonymous"), o navegador silencia a
    // saída (tainted output) e o áudio deixa de tocar — mesmo depois de
    // desativar o DJ Mode. Só faz o hookup quando temos CORS liberado.
    const isAnonymousCORS = audio.crossOrigin === "anonymous" || audio.getAttribute("crossorigin") === "anonymous";
    if (!isAnonymousCORS) {
      return null; // deixa o áudio nativo intacto; DJ Mode usa fallback rítmico
    }
    if (audioCtxMap.has(audio)) {
      const entry = audioCtxMap.get(audio)!;
      if (entry.ctx.state === "suspended") entry.ctx.resume().catch(() => {});
      return entry.analyser;
    }
    const ctx = new AudioContext();
    const source = ctx.createMediaElementSource(audio);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    audioCtxMap.set(audio, { ctx, analyser, source });
    return analyser;
  } catch {
    return null;
  }
}

/* ── Draw: Bars ── */
function drawBars(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  freqData: Uint8Array | null, bufferLength: number, peaks: number[], color: string
) {
  const barWidth = (w / bufferLength) * 0.8;
  for (let i = 0; i < bufferLength; i++) {
    const value = freqData ? freqData[i] / 255 : 0;
    const bassBoost = i < bufferLength * 0.3 ? 1.3 : i < bufferLength * 0.6 ? 1.0 : 0.7;
    const barHeight = Math.min(1, value * bassBoost) * h * 0.95;

    if (barHeight > peaks[i]) peaks[i] = barHeight;
    else { peaks[i] -= 2.5; if (peaks[i] < 0) peaks[i] = 0; }

    const x = i * (w / bufferLength);
    ctx.fillStyle = color;
    ctx.fillRect(x, h - barHeight, barWidth, barHeight);
    ctx.globalAlpha = 0.95;
    ctx.fillRect(x, h - peaks[i] - 4, barWidth, 3);
    ctx.globalAlpha = 1;
  }
}

/* ── Draw: Wave ── */
function drawWave(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  freqData: Uint8Array | null, bufferLength: number, color: string
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  for (let layer = 0; layer < 3; layer++) {
    ctx.globalAlpha = layer === 0 ? 0.9 : layer === 1 ? 0.4 : 0.15;
    ctx.beginPath();
    const phaseShift = layer * 0.3;
    const ampScale = layer === 0 ? 1 : layer === 1 ? 0.7 : 0.5;
    for (let i = 0; i <= bufferLength; i++) {
      const x = (i / bufferLength) * w;
      const value = freqData ? (freqData[i % freqData.length] / 255) : 0;
      const combined = value * ampScale + phaseShift * 0.02;
      const y = h * 0.5 - combined * h * 0.4 + h * 0.1;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Filled glow under main wave
  ctx.globalAlpha = 0.08;
  ctx.beginPath();
  for (let i = 0; i <= bufferLength; i++) {
    const x = (i / bufferLength) * w;
    const value = freqData ? (freqData[i % freqData.length] / 255) : 0;
    const y = h * 0.5 - value * h * 0.4 + h * 0.1;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineTo(w, h);
  ctx.lineTo(0, h);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;
}

/* ── Draw: Circular ── */
function drawCircular(
  ctx: CanvasRenderingContext2D, w: number, h: number,
  freqData: Uint8Array | null, bufferLength: number, color: string
) {
  const cx = w / 2;
  const cy = h * 0.55;
  const radius = Math.min(w, h) * 0.22;
  const count = 48;

  ctx.globalAlpha = 0.06;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.8, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const idx = Math.floor((i / count) * bufferLength) % bufferLength;
    const value = freqData ? (freqData[idx] / 255) : 0;
    const len = value * radius * 1.2 + radius * 0.1;

    const x1 = cx + Math.cos(angle) * radius;
    const y1 = cy + Math.sin(angle) * radius;
    const x2 = cx + Math.cos(angle) * (radius + len);
    const y2 = cy + Math.sin(angle) * (radius + len);

    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.6 + value * 0.4;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  ctx.globalAlpha = 0.15;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.85, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

const STYLE_LABELS: Record<SpectrumStyle, string> = {
  bars: "Barras",
  wave: "Onda",
  circular: "Circular",
  off: "Desligado",
};

export default function AudioSpectrum({ audioElement, barColor, style = "bars", showConfig = false, onStyleChange }: AudioSpectrumProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const peaksRef = useRef<number[]>([]);
  const styleRef = useRef(style);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqDataRef = useRef<Uint8Array | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => { styleRef.current = style; }, [style]);

  // Connect to real audio only after the media source is known and safe
  useEffect(() => {
    if (!audioElement || style === "off") return;

    const currentSrc = (audioElement.currentSrc || audioElement.src || "").trim();

    // Wait until the media element actually has a source before touching Web Audio.
    if (!currentSrc) {
      analyserRef.current = null;
      freqDataRef.current = null;
      return;
    }

    const isDirectLiveStream = /^https?:/i.test(currentSrc) && !/\.m3u8(\?|$)/i.test(currentSrc);

    // Direct radio streams (Icecast/Shoutcast/AAC+) can stop after rerouting the
    // media element through Web Audio. Keep native playback untouched for them.
    if (isDirectLiveStream) {
      analyserRef.current = null;
      freqDataRef.current = null;
      return;
    }

    const analyser = getOrCreateAnalyser(audioElement);
    analyserRef.current = analyser;
    if (analyser) {
      freqDataRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
  }, [audioElement, style, audioElement?.currentSrc, audioElement?.src]);

  useEffect(() => {
    if (style === "off") {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!audioElement || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = 64;

    if (peaksRef.current.length !== bufferLength) {
      peaksRef.current = new Array(bufferLength).fill(0);
    }

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const w = canvas.width;
      const h = canvas.height;
      const color = resolveColor(barColor);

      // Get real frequency data
      const analyser = analyserRef.current;
      let freqData = freqDataRef.current as Uint8Array<ArrayBuffer> | null;
      if (analyser && freqData) {
        analyser.getByteFrequencyData(freqData);
      } else {
        freqData = null;
      }

      ctx.clearRect(0, 0, w, h);

      switch (styleRef.current) {
        case "wave":
          drawWave(ctx, w, h, freqData, bufferLength, color);
          break;
        case "circular":
          drawCircular(ctx, w, h, freqData, bufferLength, color);
          break;
        case "off":
          break;
        default:
          drawBars(ctx, w, h, freqData, bufferLength, peaksRef.current, color);
      }
    };

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [audioElement, barColor, style]);

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

  const handleSelect = useCallback((s: SpectrumStyle) => {
    onStyleChange?.(s);
    setMenuOpen(false);
  }, [onStyleChange]);

  if (style === "off") return null;

  return (
    <div
      className="absolute left-1/2 -translate-x-1/2 z-[1]"
      style={{ bottom: 0, top: 0, width: "100%", maxWidth: "800px", pointerEvents: showConfig ? "auto" : "none" }}
    >
      <canvas ref={canvasRef} className="w-full h-full pointer-events-none" />

      {showConfig && (
        <div className="absolute top-2 right-2 z-10">
          <button
            onClick={() => setMenuOpen(o => !o)}
            className="w-7 h-7 rounded-full flex items-center justify-center transition-all"
            style={{
              background: "rgba(255,255,255,0.08)",
              backdropFilter: "blur(12px)",
              border: "1px solid rgba(255,255,255,0.12)",
            }}
            title="Estilo do espectro"
          >
            <Settings2 size={13} className="text-white/60" />
          </button>

          {menuOpen && (
            <div
              className="absolute top-9 right-0 rounded-xl overflow-hidden shadow-xl"
              style={{
                background: "rgba(20,20,20,0.9)",
                backdropFilter: "blur(20px)",
                border: "1px solid rgba(255,255,255,0.1)",
                minWidth: 130,
              }}
            >
              {(["bars", "wave", "circular", "off"] as SpectrumStyle[]).map(s => (
                <button
                  key={s}
                  onClick={() => handleSelect(s)}
                  className="w-full text-left px-3.5 py-2 text-xs font-medium transition-colors flex items-center gap-2"
                  style={{
                    color: style === s ? "var(--layout-accent-color, #fff)" : "rgba(255,255,255,0.6)",
                    background: style === s ? "rgba(255,255,255,0.06)" : "transparent",
                  }}
                >
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: style === s ? "var(--layout-accent-color, #fff)" : "transparent" }} />
                  {STYLE_LABELS[s]}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
