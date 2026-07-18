import { useEffect, useRef, useState } from "react";
import splashVideoAsset from "@/assets/nexo_player_splash.mp4.asset.json";
import { useSplashVideoCache } from "./useSplashVideoCache";

const ACCENT = "#d9ff65";

function ElegantLoader() {
  return (
    <div
      style={{
        width: 56,
        height: 56,
        borderRadius: "50%",
        border: "1.5px solid rgba(255,255,255,0.08)",
        borderTopColor: ACCENT,
        borderRightColor: ACCENT,
        animation: "splash-elegant-spin 1.1s cubic-bezier(0.4, 0, 0.2, 1) infinite",
        boxShadow: `0 0 24px ${ACCENT}22`,
      }}
    >
      <style>{`@keyframes splash-elegant-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}


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

  // Force preload + try to play with audio; fallback to muted autoplay if blocked.
  // Only starts once the src is resolved from cache so the element never reloads mid-play.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !videoSrc) return;
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
  }, [reducedMotion, videoSrc]);

  // Only transition once BOTH the video finished playing AND the backend is ready
  useEffect(() => {
    if (videoEnded && ready && !finishedRef.current) {
      finishedRef.current = true;
      const t = setTimeout(() => setFadeOut(true), reducedMotion ? 0 : 120);
      return () => clearTimeout(t);
    }
  }, [videoEnded, ready, reducedMotion]);

  // Fire onFinish only after the fade-out completes, so the parent swaps content
  // after the splash is fully gone (avoids any perceived desync).
  useEffect(() => {
    if (!fadeOut) return;
    const t = setTimeout(() => onFinish(), reducedMotion ? 200 : 900);
    return () => clearTimeout(t);
  }, [fadeOut, reducedMotion, onFinish]);

  const handleEnded = () => {
    const v = videoRef.current;
    if (v) {
      try {
        v.pause();
        v.currentTime = Math.max(0, v.duration - 0.05);
      } catch {}
    }
    setVideoEnded(true);
  };

  const handleVideoError = () => {
    // If the video can't be decoded/served (404, wrong MIME, blocked codec),
    // don't leave the splash stuck forever — treat it as "ended".
    setVideoEnded(true);
  };

  // Absolute safety timeout: even if the <video> never fires `ended` or `error`
  // (e.g. autoplay policies on some embedded browsers), force-progress after 8s.
  useEffect(() => {
    const t = setTimeout(() => setVideoEnded(true), 8000);
    return () => clearTimeout(t);
  }, []);



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
      {videoSrc && (
        <video
          ref={videoRef}
          src={videoSrc}
          className="absolute inset-0 w-full h-full object-cover"
          autoPlay
          playsInline
          preload="auto"
          disablePictureInPicture
          onEnded={handleEnded}
          onError={handleVideoError}
          onStalled={handleVideoError}
          style={{
            willChange: "transform, opacity",
            transform: "translateZ(0)",
            backfaceVisibility: "hidden",
          }}
        />
      )}
      <div
        className="absolute inset-x-0 bottom-0 flex items-end justify-center"
        style={{
          paddingBottom: "12vh",
          transform: reducedMotion ? "none" : fadeOut ? "scale(0.9)" : "scale(1)",
          opacity: fadeOut ? 0 : 1,
          transition: reducedMotion
            ? `opacity ${fadeDuration}ms linear`
            : `opacity 500ms ease-out, transform 700ms ${easing}`,
        }}
      >
        <ElegantLoader />
      </div>
    </div>
  );
}

