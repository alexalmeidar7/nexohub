import { useEffect, useRef, useState, useCallback } from "react";
import { Settings2 } from "lucide-react";

export type SpectrumStyle = "bars" | "wave" | "circular";

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

/* ── Draw: Bars ── */
function drawBars(
  ctx: CanvasRenderingContext2D, w: number, h: number, t: number, active: boolean,
  bufferLength: number, barOffsets: number[], barSpeeds: number[], peaks: number[], color: string
) {
  const barWidth = (w / bufferLength) * 0.8;
  for (let i = 0; i < bufferLength; i++) {
    const off = barOffsets[i];
    const spd = barSpeeds[i];
    const w1 = Math.sin(t * spd + i * 0.22 + off) * 0.5 + 0.5;
    const w2 = Math.sin(t * 1.4 * spd + i * 0.45) * 0.4 + 0.5;
    const w3 = Math.cos(t * 0.8 + i * 0.12 + off * 2) * 0.3 + 0.5;
    const spike = Math.pow(Math.sin(t * 0.5 + i * 0.08), 8) * 0.4;
    const combined = w1 * 0.35 + w2 * 0.3 + w3 * 0.2 + spike * 0.15;
    const bassBoost = i < bufferLength * 0.3 ? 1.3 : i < bufferLength * 0.6 ? 1.0 : 0.7;
    const intensity = active ? 1.1 : 0.08;
    const barHeight = Math.min(1, combined * bassBoost * intensity) * h * 0.95;

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
  ctx: CanvasRenderingContext2D, w: number, h: number, t: number, active: boolean,
  bufferLength: number, barOffsets: number[], barSpeeds: number[], color: string
) {
  const intensity = active ? 1 : 0.1;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.5;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  // Draw 3 layered waves for depth
  for (let layer = 0; layer < 3; layer++) {
    ctx.globalAlpha = layer === 0 ? 0.9 : layer === 1 ? 0.4 : 0.15;
    ctx.beginPath();
    const phaseShift = layer * 1.2;
    const ampScale = layer === 0 ? 1 : layer === 1 ? 0.7 : 0.5;
    for (let i = 0; i <= bufferLength; i++) {
      const x = (i / bufferLength) * w;
      const off = barOffsets[i % bufferLength];
      const spd = barSpeeds[i % bufferLength];
      const y1 = Math.sin(t * spd * 0.8 + i * 0.18 + off + phaseShift) * 0.5 + 0.5;
      const y2 = Math.sin(t * 1.2 + i * 0.35 + phaseShift) * 0.3 + 0.5;
      const combined = (y1 * 0.6 + y2 * 0.4) * intensity * ampScale;
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
    const off = barOffsets[i % bufferLength];
    const spd = barSpeeds[i % bufferLength];
    const y1 = Math.sin(t * spd * 0.8 + i * 0.18 + off) * 0.5 + 0.5;
    const y2 = Math.sin(t * 1.2 + i * 0.35) * 0.3 + 0.5;
    const combined = (y1 * 0.6 + y2 * 0.4) * intensity;
    const y = h * 0.5 - combined * h * 0.4 + h * 0.1;
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
  ctx: CanvasRenderingContext2D, w: number, h: number, t: number, active: boolean,
  bufferLength: number, barOffsets: number[], barSpeeds: number[], color: string
) {
  const cx = w / 2;
  const cy = h * 0.55;
  const radius = Math.min(w, h) * 0.22;
  const intensity = active ? 1 : 0.1;
  const count = 48;

  // Outer glow
  ctx.globalAlpha = 0.06;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 1.8, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.globalAlpha = 1;

  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
    const idx = i % bufferLength;
    const off = barOffsets[idx];
    const spd = barSpeeds[idx];
    const v1 = Math.sin(t * spd + i * 0.3 + off) * 0.5 + 0.5;
    const v2 = Math.cos(t * 0.9 + i * 0.2) * 0.3 + 0.5;
    const combined = (v1 * 0.6 + v2 * 0.4) * intensity;
    const len = combined * radius * 1.2 + radius * 0.1;

    const x1 = cx + Math.cos(angle) * radius;
    const y1 = cy + Math.sin(angle) * radius;
    const x2 = cx + Math.cos(angle) * (radius + len);
    const y2 = cy + Math.sin(angle) * (radius + len);

    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.6 + combined * 0.4;
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }

  // Inner circle
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
};

export default function AudioSpectrum({ audioElement, barColor, style = "bars", showConfig = false, onStyleChange }: AudioSpectrumProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const peaksRef = useRef<number[]>([]);
  const styleRef = useRef(style);
  const [menuOpen, setMenuOpen] = useState(false);

  // Keep ref in sync
  useEffect(() => { styleRef.current = style; }, [style]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!audioElement || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = 64;
    const barOffsets = Array.from({ length: bufferLength }, () => Math.random() * Math.PI * 2);
    const barSpeeds = Array.from({ length: bufferLength }, () => 0.7 + Math.random() * 1.8);

    if (peaksRef.current.length !== bufferLength) {
      peaksRef.current = new Array(bufferLength).fill(0);
    }

    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const w = canvas.width;
      const h = canvas.height;
      const t = performance.now() / 280;
      const active = !audioElement.paused;
      const color = resolveColor(barColor);

      ctx.clearRect(0, 0, w, h);

      switch (styleRef.current) {
        case "wave":
          drawWave(ctx, w, h, t, active, bufferLength, barOffsets, barSpeeds, color);
          break;
        case "circular":
          drawCircular(ctx, w, h, t, active, bufferLength, barOffsets, barSpeeds, color);
          break;
        default:
          drawBars(ctx, w, h, t, active, bufferLength, barOffsets, barSpeeds, peaksRef.current, color);
      }
    };

    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [audioElement, barColor]);

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
              {(["bars", "wave", "circular"] as SpectrumStyle[]).map(s => (
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
