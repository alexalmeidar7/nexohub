import { forwardRef } from "react";
import ElegantLoader from "@/components/player/ElegantLoader";

interface LoadingSpinnerProps {
  size?: number;
  fullscreen?: boolean;
  className?: string;
  color?: string;
  background?: string;
}

export const LOADING_ACCENT = "#ffffff";

const LoadingSpinner = forwardRef<HTMLDivElement, LoadingSpinnerProps>(function LoadingSpinner({
  size = 44,
  fullscreen = false,
  className = "",
  color = "#ffffff",
  background = "#000000",
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
