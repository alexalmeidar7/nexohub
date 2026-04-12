import React, { useRef, useState, useCallback } from "react";

interface GradientPickerProps {
  colorA: string;
  colorB: string;
  angle: number;
  midpoint?: number;
  gradientType?: "linear" | "radial";
  onChangeColorA: (color: string) => void;
  onChangeColorB: (color: string) => void;
  onChangeAngle: (angle: number) => void;
  onChangeMidpoint?: (midpoint: number) => void;
  onChangeType?: (type: "linear" | "radial") => void;
  showType?: boolean;
  showMidpoint?: boolean;
  /** Radial-specific */
  position?: string;
  onChangePosition?: (pos: string) => void;
}

const POSITIONS = ["top-left", "top", "top-right", "left", "center", "right", "bottom-left", "bottom", "bottom-right"];
const POS_LABELS: Record<string, string> = {
  "top-left": "↖", top: "↑", "top-right": "↗",
  left: "←", center: "●", right: "→",
  "bottom-left": "↙", bottom: "↓", "bottom-right": "↘",
};

export function GradientPicker({
  colorA, colorB, angle, midpoint = 50,
  gradientType = "linear",
  onChangeColorA, onChangeColorB, onChangeAngle, onChangeMidpoint,
  onChangeType, showType = false, showMidpoint = false,
  position, onChangePosition,
}: GradientPickerProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"A" | "B" | "mid" | null>(null);

  // Color dot positions on bar: A at start, B at end, midpoint between
  const midPercent = midpoint;

  const handleBarMouseDown = useCallback((e: React.MouseEvent, which: "A" | "B" | "mid") => {
    e.preventDefault();
    e.stopPropagation();
    if (which === "mid" && !onChangeMidpoint) return;
    setDragging(which);

    const onMove = (ev: MouseEvent) => {
      if (!barRef.current) return;
      const rect = barRef.current.getBoundingClientRect();
      const pct = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100));
      if (which === "mid" && onChangeMidpoint) {
        onChangeMidpoint(Math.round(Math.max(10, Math.min(100, pct))));
      }
    };

    const onUp = () => {
      setDragging(null);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [onChangeMidpoint]);

  // Angle knob drag
  const handleKnobMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const knob = knobRef.current;
    if (!knob) return;

    const onMove = (ev: MouseEvent) => {
      const rect = knob.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const rad = Math.atan2(ev.clientY - cy, ev.clientX - cx);
      let deg = Math.round((rad * 180) / Math.PI + 90);
      if (deg < 0) deg += 360;
      onChangeAngle(deg);
    };

    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }, [onChangeAngle]);

  const textColor = "var(--layout-page-text, #ccc)";
  const mutedBg = "color-mix(in srgb, var(--layout-page-text, #1a1a1a) 8%, transparent)";
  const activeBg = "var(--layout-header-bg, #1a1a1a)";
  const activeText = "var(--layout-header-text, #fff)";

  return (
    <div className="space-y-3">
      {/* Type selector */}
      {showType && onChangeType && (
        <div className="flex gap-1.5">
          {(["linear", "radial"] as const).map(gt => (
            <button key={gt} onClick={() => onChangeType(gt)}
              className="flex-1 px-3 py-1.5 text-[10px] font-bold rounded-lg transition-all"
              style={{
                backgroundColor: gradientType === gt ? activeBg : mutedBg,
                color: gradientType === gt ? activeText : textColor,
              }}>
              {gt === "linear" ? "Linear" : "Circular (Radial)"}
            </button>
          ))}
        </div>
      )}

      {/* Gradient bar with color dots */}
      <div className="flex items-center gap-3">
        <div className="flex-1 relative" ref={barRef}>
          {/* Gradient bar */}
          <div
            className="w-full h-3 rounded-full"
            style={{
              background: `linear-gradient(90deg, ${colorA} 0%, ${colorB} 100%)`,
            }}
          />

          {/* Color A dot */}
          <div
            className="absolute top-1/2 -translate-y-1/2 cursor-pointer"
            style={{ left: "0%", transform: "translate(-50%, -50%)" }}
          >
            <label className="block relative">
              <div
                className="w-5 h-5 rounded-full border-2 border-white shadow-md cursor-pointer"
                style={{ backgroundColor: colorA, boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
              />
              <input
                type="color"
                value={colorA}
                onChange={e => onChangeColorA(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </label>
          </div>

          {/* Midpoint dot (draggable) */}
          {showMidpoint && onChangeMidpoint && (
            <div
              className="absolute top-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing"
              style={{ left: `${midPercent}%`, transform: "translate(-50%, -50%)" }}
              onMouseDown={e => handleBarMouseDown(e, "mid")}
            >
              <div
                className="w-4 h-4 rounded-full border-2 border-white shadow-md"
                style={{
                  background: `color-mix(in srgb, ${colorA} ${100 - midPercent}%, ${colorB})`,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
                }}
              />
            </div>
          )}

          {/* Color B dot */}
          <div
            className="absolute top-1/2 -translate-y-1/2 cursor-pointer"
            style={{ left: "100%", transform: "translate(-50%, -50%)" }}
          >
            <label className="block relative">
              <div
                className="w-5 h-5 rounded-full border-2 border-white shadow-md cursor-pointer"
                style={{ backgroundColor: colorB, boxShadow: "0 2px 8px rgba(0,0,0,0.4)" }}
              />
              <input
                type="color"
                value={colorB}
                onChange={e => onChangeColorB(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
            </label>
          </div>
        </div>

        {/* Angle knob (for linear) or Position grid (for radial) */}
        {gradientType === "linear" ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            <div
              ref={knobRef}
              className="relative w-10 h-10 rounded-full cursor-grab active:cursor-grabbing flex-shrink-0"
              style={{
                background: "conic-gradient(from 0deg, #555 0%, #333 100%)",
                boxShadow: "0 2px 8px rgba(0,0,0,0.3), inset 0 1px 2px rgba(255,255,255,0.1)",
              }}
              onMouseDown={handleKnobMouseDown}
            >
              {/* Needle */}
              <div
                className="absolute w-0.5 h-3.5 rounded-full bg-white left-1/2 -translate-x-1/2"
                style={{
                  top: "3px",
                  transformOrigin: "center calc(100% + 2px)",
                  transform: `translateX(-50%) rotate(${angle}deg)`,
                }}
              />
              {/* Center dot */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-white/60" />
            </div>
            <span className="text-[10px] font-bold tabular-nums" style={{ color: textColor }}>{angle}°</span>
          </div>
        ) : position !== undefined && onChangePosition ? (
          <div className="grid grid-cols-3 gap-0.5 flex-shrink-0">
            {POSITIONS.map(p => (
              <button key={p} onClick={() => onChangePosition(p)}
                className="w-5 h-5 rounded text-[7px] font-bold transition-all flex items-center justify-center"
                style={{
                  backgroundColor: position === p ? activeBg : mutedBg,
                  color: position === p ? activeText : textColor,
                }}>
                {POS_LABELS[p]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Hex values below */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1 flex-1">
          <span className="text-[9px] opacity-50" style={{ color: textColor }}>#</span>
          <input
            value={colorA.replace("#", "")}
            onChange={e => {
              const v = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
              if (v.length === 6) onChangeColorA(`#${v}`);
            }}
            onBlur={e => {
              const v = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
              if (v.length >= 3) onChangeColorA(`#${v.padEnd(6, "0")}`);
            }}
            className="w-16 px-1.5 py-0.5 rounded text-[10px] font-mono outline-none"
            style={{ backgroundColor: mutedBg, color: textColor, border: "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 12%, transparent)" }}
          />
        </div>
        {showMidpoint && (
          <span className="text-[9px] font-medium tabular-nums" style={{ color: textColor }}>
            {midPercent}%
          </span>
        )}
        <div className="flex items-center gap-1 flex-1 justify-end">
          <span className="text-[9px] opacity-50" style={{ color: textColor }}>#</span>
          <input
            value={colorB.replace("#", "")}
            onChange={e => {
              const v = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
              if (v.length === 6) onChangeColorB(`#${v}`);
            }}
            onBlur={e => {
              const v = e.target.value.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
              if (v.length >= 3) onChangeColorB(`#${v.padEnd(6, "0")}`);
            }}
            className="w-16 px-1.5 py-0.5 rounded text-[10px] font-mono outline-none"
            style={{ backgroundColor: mutedBg, color: textColor, border: "1px solid color-mix(in srgb, var(--layout-page-text, #1a1a1a) 12%, transparent)" }}
          />
        </div>
      </div>
    </div>
  );
}
