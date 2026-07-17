import { useEffect, useRef, useState } from "react";
import LoadingSpinner from "@/components/LoadingSpinner";
import splashVideoAsset from "@/assets/nexo_player_splash.mp4.asset.json";
import { useSplashVideoCache } from "./useSplashVideoCache";


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
  const [reducedMotion, setReducedMotion] = useState(false);
  const videoSrc = useSplashVideoCache(splashVideoAsset.url);


  // Detect prefers-reduced-motion
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  // Force preload + try to play with audio; fallback to muted autoplay if blocked
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    try {
      v.load();
      v.muted = reducedMotion ? true : false;
      v.volume = reducedMotion ? 0 : 1;
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
  }, [reducedMotion]);

  useEffect(() => {
    if (videoEnded && ready && !finishedRef.current) {
      finishedRef.current = true;
      const t = setTimeout(() => setFadeOut(true), reducedMotion ? 0 : 120);
      return () => clearTimeout(t);
    }
  }, [videoEnded, ready, reducedMotion]);

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

  const fadeDuration = reducedMotion ? 200 : 900;
  const easing = "cubic-bezier(0.22, 1, 0.36, 1)";

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden pointer-events-auto"
      style={{
        backgroundColor: "#131519",
        opacity: fadeOut ? 0 : 1,
        transform: reducedMotion ? "none" : fadeOut ? "scale(1.03)" : "scale(1)",
        transition: reducedMotion
          ? `opacity ${fadeDuration}ms linear`
          : `opacity ${fadeDuration}ms ${easing}, transform ${fadeDuration}ms ${easing}`,
        pointerEvents: fadeOut ? "none" : "auto",
      }}
    >
      <video
        ref={videoRef}
        src={videoSrc}
        className="absolute inset-0 w-full h-full object-cover"
        autoPlay
        playsInline
        preload="auto"
        disablePictureInPicture
        onEnded={handleEnded}
        style={{
          willChange: "transform, opacity",
          transform: "translateZ(0)",
          backfaceVisibility: "hidden",
        }}
      />
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          transform: reducedMotion
            ? "translateY(50px)"
            : `translateY(50px) ${fadeOut ? "scale(0.9)" : "scale(1)"}`,
          opacity: fadeOut ? 0 : 1,
          transition: reducedMotion
            ? `opacity ${fadeDuration}ms linear`
            : `opacity 500ms ease-out, transform 700ms ${easing}`,
        }}
      >
        <LoadingSpinner size={48} />
      </div>
    </div>
  );
}

