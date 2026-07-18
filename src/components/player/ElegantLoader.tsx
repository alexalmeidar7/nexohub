const ACCENT = "#d9ff65";

interface ElegantLoaderProps {
  size?: number;
  color?: string;
  className?: string;
}

/**
 * Elegant arc loader used across the Player experience.
 * Matches the SplashScreen loader (lime accent arc + soft glow).
 */
export default function ElegantLoader({ size = 56, color = ACCENT, className }: ElegantLoaderProps) {
  const borderWidth = Math.max(1, Math.round(size / 37));
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `${borderWidth}px solid rgba(255,255,255,0.08)`,
        borderTopColor: color,
        borderRightColor: color,
        animation: "elegant-loader-spin 1.1s cubic-bezier(0.4, 0, 0.2, 1) infinite",
        boxShadow: `0 0 24px ${color}22`,
        boxSizing: "border-box",
      }}
    >
      <style>{`@keyframes elegant-loader-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
