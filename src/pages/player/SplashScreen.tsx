import { useEffect, useRef, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import splashVideoAsset from "@/assets/nexo_player_splash.mp4.asset.json";

interface SplashScreenProps {
  logoUrl?: string | null;
  channelName?: string;
  /** Called once the intro video finishes playing. Parent should still gate on backend readiness before advancing. */
  onFinish: () => void;
  /** When true, fade out (backend is ready). */
  ready?: boolean;
}

export default function SplashScreen({ onFinish, ready = true }: SplashScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoEnded, setVideoEnded] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const finishedRef = useRef(false);

  // Fade out only when video ended AND backend ready
  useEffect(() => {
    if (videoEnded && ready && !finishedRef.current) {
      finishedRef.current = true;
      const t = setTimeout(() => setFadeOut(true), 150);
      return () => clearTimeout(t);
    }
  }, [videoEnded, ready]);

  const handleEnded = () => {
    const v = videoRef.current;
    if (v) {
      try {
        v.pause();
        // Keep paused on last frame
        v.currentTime = Math.max(0, v.duration - 0.05);
      } catch {}
    }
    setVideoEnded(true);
    onFinish();
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-700 ${
        fadeOut ? "opacity-0 pointer-events-none" : "opacity-100"
      }`}
      style={{ backgroundColor: "#131519" }}
      onTransitionEnd={() => {
        if (fadeOut) {
          // no-op — parent controls unmount via step change
        }
      }}
    >
      <div className="mb-12 flex items-center justify-center" style={{ height: "9.5rem" }}>
        <video
          ref={videoRef}
          src={splashVideoAsset.url}
          className="h-full w-auto object-contain drop-shadow-lg"
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={handleEnded}
        />
      </div>

      <LoadingSpinner size={32} />
    </div>
  );
}
