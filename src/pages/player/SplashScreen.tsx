import { useEffect, useState } from "react";
import ElegantLoader from "@/components/player/ElegantLoader";
import { isPlayerTvApp } from "@/lib/playerTvApp";
import { OttFrame } from "@/components/player/tv/OttFrame";

interface SplashScreenProps {
  onFinish: () => void;
  ready?: boolean;
  maxDurationMs?: number;
  progress?: number;
  logoUrl?: string | null;
}

export default function SplashScreen({
  onFinish,
  ready = true,
  maxDurationMs = 3000,
  logoUrl,
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

  if (isPlayerTvApp()) return <OttFrame className="ott-black"><img className="ott-splash-mark" src={logoUrl || "/images/player-ott-seal-white.png"} alt="Logo da emissora" /><div className="ott-spinner" role="status" aria-label="Carregando" /></OttFrame>;

  return (
    <div
      data-player-splash
      className="fixed inset-0 z-50 overflow-hidden bg-black"
      style={{
        opacity: fadeOut ? 0 : 1,
        transition: `opacity ${fadeDuration}ms ease-out`,
        pointerEvents: fadeOut ? "none" : "auto",
      }}
    >
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <img
          src="/images/player-ott-seal-white.png"
          alt="Nexo OTT Player"
          className="w-[clamp(108px,12vw,154px)] h-auto object-contain opacity-90"
          draggable={false}
        />
        <div className="mt-10 flex items-center justify-center">
          <ElegantLoader size={42} />
        </div>
      </div>
    </div>
  );
}
