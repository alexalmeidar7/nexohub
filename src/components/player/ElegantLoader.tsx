interface ElegantLoaderProps {
  size?: number;
  color?: string;
  className?: string;
}

/**
 * Unified player loader — thin gray ring with a single bright arc rotating.
 * Used everywhere in the Player experience (splash, access, routing, etc.).
 */
export default function ElegantLoader({ size = 42, color = "#ffffff", className }: ElegantLoaderProps) {
  const borderWidth = Math.max(1.5, Math.round(size / 21));
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `${borderWidth}px solid rgba(120,120,120,0.55)`,
        borderTopColor: color,
        animation: "elegant-loader-spin 0.9s linear infinite",
        boxSizing: "border-box",
      }}
    >
      <style>{`@keyframes elegant-loader-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
