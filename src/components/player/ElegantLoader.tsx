import { forwardRef } from "react";

interface ElegantLoaderProps {
  size?: number;
  color?: string;
  className?: string;
  progress?: number; // Optional progress (0-100)
}

/**
 * Unified player loader — SVG-based thin ring with a smooth rotating arc.
 * If 'progress' is provided, it shows a static progress ring instead of spinning.
 */
const ElegantLoader = forwardRef<HTMLDivElement, ElegantLoaderProps>(function ElegantLoader({ size = 42, color = "#ffffff", className, progress }, ref) {
  const stroke = Math.max(1.5, size / 12);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  
  // If progress is undefined, we use a 25% arc that spins.
  // If progress is defined, we use the progress percentage.
  const isIndeterminate = progress === undefined;
  const percentage = isIndeterminate ? 0.25 : Math.min(100, Math.max(0, progress)) / 100;
  const arc = c * percentage;

  return (
    <div
      ref={ref}
      className={className}
      style={{
        width: size,
        height: size,
        display: "inline-block",
        animation: isIndeterminate ? "elegant-loader-spin 0.9s linear infinite" : "none",
        transition: "transform 0.3s ease-out",
      }}
      aria-label={isIndeterminate ? "Carregando" : `Carregando ${Math.round(progress!)}%`}
      role="status"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: "block" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(120,120,120,0.45)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${arc} ${c - arc}`}
          style={{
            transition: isIndeterminate ? "none" : "stroke-dasharray 0.3s ease-out",
          }}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {isIndeterminate && (
        <style>{`@keyframes elegant-loader-spin { to { transform: rotate(360deg); } }`}</style>
      )}
    </div>
  );
});

export default ElegantLoader;
