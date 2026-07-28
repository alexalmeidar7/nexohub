import ElegantLoader from "@/components/player/ElegantLoader";

interface LoadingSpinnerProps {
  size?: number;
  fullscreen?: boolean;
  className?: string;
  color?: string;
  background?: string;
}

export const LOADING_ACCENT = "#d9ff65";

export default function LoadingSpinner({
  size = 32,
  fullscreen = false,
  className = "",
  color = LOADING_ACCENT,
  background = "#131519",
}: LoadingSpinnerProps) {
  if (fullscreen) {
    return (
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center ${className}`}
        style={{ backgroundColor: background }}
      >
        <ElegantLoader size={size} color={color} />
      </div>
    );
  }
  return <ElegantLoader size={size} color={color} className={className} />;
}
