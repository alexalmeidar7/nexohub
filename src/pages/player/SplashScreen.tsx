import { useEffect, useState } from "react";
import ElegantLoader from "@/components/player/ElegantLoader";

interface SplashScreenProps {
  onFinish: () => void;
  ready?: boolean;
  maxDurationMs?: number;
  progress?: number;
}

export default function SplashScreen({
  onFinish,
  ready = true,
  maxDurationMs = 3000,
  progress = 0,
}: SplashScreenProps) {
  const [fadeOut, setFadeOut] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => setFadeOut(true), maxDurationMs);
    return () => window.clearTimeout(timer);
  }, [ready, maxDurationMs]);

  useEffect(() => {
    if (!fadeOut) return;
    const timer = window.setTimeout(() => onFinish(), reducedMotion ? 100 : 650);
    return () => window.clearTimeout(timer);
  }, [fadeOut, reducedMotion, onFinish]);

  const fadeDuration = reducedMotion ? 150 : 650;

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-black"
      style={{
        opacity: fadeOut ? 0 : 1,
        transition: `opacity ${fadeDuration}ms ease-out`,
        pointerEvents: fadeOut ? "none" : "auto",
      }}
    >
      <img
        src="/nexo-player-splash.png"
        alt="Nexo Player"
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-center pb-[7vh]">
        <div className="flex flex-col items-center gap-3">
          <ElegantLoader size={42} progress={progress} />
          <p className="text-white/45 text-[10px] uppercase tracking-widest font-tv-medium">
            {progress < 100 ? `sincronizando ${Math.round(progress)}%` : "pronto"}
          </p>
        </div>
      </div>
    </div>
  );
}
