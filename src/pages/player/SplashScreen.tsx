import { useEffect, useRef, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import splashVideoAsset from "@/assets/nexo_player_splash.mp4.asset.json";

interface SplashScreenProps {
  logoUrl?: string | null;
  channelName?: string;
  onFinish: () => void;
  ready?: boolean;
}

export default function SplashScreen({ onFinish, ready = true }: SplashScreenProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoEnded, setVideoEnded] = useState(false);
  const [fadeOut, setFadeOut] = useState(false);
  const finishedRef = useRef(false);

  // Force preload + try to play with audio; fallback to muted autoplay if blocked
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    try {
      v.load();
      v.muted = false;
      v.volume = 1;
      const p = v.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => {
          try {
            v.muted = true;
            v.play().catch(() => {});
          } catch {}
        });
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (videoEnded && ready && !finishedRef.current) {
      finishedRef.current = true;
      const t = setTimeout(() => setFadeOut(true), 120);
      return () => clearTimeout(t);
    }
  }, [videoEnded, ready]);

  const handleEnded = () => {
    const v = videoRef.current;
    if (v) {
      try {
        v.pause();
        v.currentTime = Math.max(0, v.duration - 0.05);
      } catch {}
    }
    setVideoEnded(true);
    onFinish();
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden pointer-events-auto"
      style={{
        backgroundColor: "#131519",
        opacity: fadeOut ? 0 : 1,
        transform: fadeOut ? "scale(1.03)" : "scale(1)",
        transition:
          "opacity 900ms cubic-bezier(0.22, 1, 0.36, 1), transform 900ms cubic-bezier(0.22, 1, 0.36, 1)",
        pointerEvents: fadeOut ? "none" : "auto",
      }}
    >
      <video
        ref={videoRef}
        src={splashVideoAsset.url}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={handleEnded}
      />
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          transform: `translateY(50px) ${fadeOut ? "scale(0.9)" : "scale(1)"}`,
          opacity: fadeOut ? 0 : 1,
          transition:
            "opacity 500ms ease-out, transform 700ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <LoadingSpinner size={48} />
      </div>
    </div>
  );
}
