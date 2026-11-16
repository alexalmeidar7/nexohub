import { useState, useEffect } from "react";
import ElegantLoader from "@/components/player/ElegantLoader";

interface LoadingOverlayProps {
  isLoading: boolean;
  onFinished?: () => void;
  minDurationMs?: number;
  progress?: number;
}

/**
 * A full-screen black overlay with the ElegantLoader.
 * It remains visible for at least minDurationMs to ensure the video has 
 * enough time to buffer/initialize before revealing the player UI.
 */
export default function PlayerLoadingOverlay({ 
  isLoading, 
  onFinished,
  minDurationMs = 3000,
}: LoadingOverlayProps) {
  const [show, setShow] = useState(true);
  const [shouldFadeOut, setShouldFadeOut] = useState(false);
  const [timerExpired, setTimerExpired] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setTimerExpired(true);
    }, minDurationMs);
    return () => clearTimeout(timer);
  }, [minDurationMs]);

  useEffect(() => {
    // Only hide if the internal timer expired AND the external isLoading is false
    if (!isLoading && timerExpired) {
      setShouldFadeOut(true);
      const hideTimer = setTimeout(() => {
        setShow(false);
        onFinished?.();
      }, 500); // fade duration
      return () => clearTimeout(hideTimer);
    }
  }, [isLoading, timerExpired, onFinished]);

  if (!show) return null;

  return (
    <div 
      className={`fixed inset-0 z-[9999] bg-black flex items-center justify-center transition-opacity duration-500 ${
        shouldFadeOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
    >
      <div className="flex items-center justify-center animate-fade-in">
        <ElegantLoader size={44} />
      </div>

    </div>
  );
}
