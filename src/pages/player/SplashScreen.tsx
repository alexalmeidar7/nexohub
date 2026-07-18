import { useEffect, useRef, useState } from "react";
import splashVideoAsset from "@/assets/nexo_player_splash.mp4.asset.json";
import nexoLogo from "@/assets/logo-nexo.png";
import { useSplashVideoCache } from "./useSplashVideoCache";

const ACCENT = "#ffffff";

/**
 * Apple-TV style splash loader — thin white ring with a soft gradient arc.
 */
function SplashRingLoader() {
  return (
    <div
      style={{
        width: 46,
        height: 46,
        borderRadius: "50%",
        border: "1.5px solid rgba(255,255,255,0.14)",
        borderTopColor: "rgba(255,255,255,0.95)",
        borderRightColor: "rgba(255,255,255,0.55)",
        animation: "splash-ring-spin 1.05s cubic-bezier(0.45,0.05,0.55,0.95) infinite",
        boxShadow: "0 0 18px rgba(255,255,255,0.18)",
        boxSizing: "border-box",
      }}
    >
      <style>{`@keyframes splash-ring-spin { to { transform: rotate(360deg); } }`}</style>
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
  const [videoFailed, setVideoFailed] = useState(false);
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
    // don't leave the splash stuck forever — show a visual fallback and treat as ended.
    setVideoFailed(true);
    setVideoEnded(true);
  };

  // If the src never resolves from cache/network in a reasonable time, show fallback.
  useEffect(() => {
    if (videoSrc) return;
    const t = setTimeout(() => setVideoFailed(true), 3500);
    return () => clearTimeout(t);
  }, [videoSrc]);

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
      {/* Visual fallback: shown when the video failed to load/decode or hasn't
          resolved from cache in a reasonable time. Guarantees the user never
          sees a blank/frozen screen. */}
      <div
        aria-hidden={!videoFailed}
        style={{
          position: "absolute",
          inset: 0,
          opacity: videoFailed || !videoSrc ? 1 : 0,
          transition: "opacity 600ms ease-out",
          background:
            "radial-gradient(120% 80% at 50% 40%, #1e2430 0%, #131519 60%, #0b0d10 100%)",
          overflow: "hidden",
        }}
      >
        {/* Subtle animated accent glow */}
        <div
          style={{
            position: "absolute",
            top: "-20%",
            left: "-10%",
            width: "60%",
            height: "60%",
            background: `radial-gradient(circle, ${ACCENT}22 0%, transparent 70%)`,
            filter: "blur(40px)",
            animation: reducedMotion ? undefined : "splash-fallback-drift 8s ease-in-out infinite alternate",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-20%",
            right: "-10%",
            width: "70%",
            height: "70%",
            background: "radial-gradient(circle, #2a3244aa 0%, transparent 70%)",
            filter: "blur(50px)",
            animation: reducedMotion ? undefined : "splash-fallback-drift 10s ease-in-out infinite alternate-reverse",
          }}
        />
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            transform: reducedMotion ? "none" : "translateY(-6vh)",
          }}
        >
          <img
            src={nexoLogo}
            alt=""
            draggable={false}
            style={{
              width: "min(220px, 28vw)",
              height: "auto",
              opacity: 0.92,
              filter: "drop-shadow(0 8px 40px rgba(0,0,0,0.5))",
              animation: reducedMotion ? undefined : "splash-fallback-pulse 2.4s ease-in-out infinite",
            }}
          />
        </div>
        <style>{`
          @keyframes splash-fallback-drift {
            from { transform: translate(0, 0); }
            to { transform: translate(6%, 4%); }
          }
          @keyframes splash-fallback-pulse {
            0%, 100% { opacity: 0.85; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.015); }
          }
        `}</style>
      </div>

      {videoSrc && !videoFailed && (
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

