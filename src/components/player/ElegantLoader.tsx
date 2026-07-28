interface ElegantLoaderProps {
  size?: number;
  color?: string;
  className?: string;
}

/**
 * Unified player loader — SVG-based thin ring with a smooth rotating arc.
 * Uses SVG instead of CSS borders to avoid rendering glitches (truncated
 * lines / corner artifacts) that appeared at some zoom levels on Chromium.
 */
export default function ElegantLoader({ size = 42, color = "#ffffff", className }: ElegantLoaderProps) {
  const stroke = Math.max(1.5, size / 12);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const arc = c * 0.25; // 25% visible arc

  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        display: "inline-block",
        animation: "elegant-loader-spin 0.9s linear infinite",
      }}
      aria-label="Carregando"
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
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <style>{`@keyframes elegant-loader-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
