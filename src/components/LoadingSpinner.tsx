import { Loader2 } from "lucide-react";

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
        <Loader2 className="animate-spin" size={size} style={{ color }} />
      </div>
    );
  }
  return (
    <Loader2 className={`animate-spin ${className}`} size={size} style={{ color }} />
  );
}
