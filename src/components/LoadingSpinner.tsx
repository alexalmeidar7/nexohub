import { forwardRef } from "react";
import ElegantLoader from "@/components/player/ElegantLoader";

interface LoadingSpinnerProps {
  size?: number;
  fullscreen?: boolean;
  className?: string;
  color?: string;
  background?: string;
}

export const LOADING_ACCENT = "#d9ff65";

const LoadingSpinner = forwardRef<HTMLDivElement, LoadingSpinnerProps>(function LoadingSpinner({
  size = 32,
  fullscreen = false,
  className = "",
  color = LOADING_ACCENT,
  background = "#131519",
}, ref) {
  if (fullscreen) {
    return (
      <div
        ref={ref}
        className={`fixed inset-0 z-50 flex items-center justify-center ${className}`}
        style={{ backgroundColor: background }}
      >
        <ElegantLoader size={size} color={color} />
      </div>
    );
  }
  return <ElegantLoader ref={ref} size={size} color={color} className={className} />;
});

export default LoadingSpinner;
