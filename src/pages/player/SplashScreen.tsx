import { useEffect, useState } from "react";
import ElegantLoader from "@/components/player/ElegantLoader";
import { isPlayerOtt } from "@/lib/playerTvApp";
import { getStationLogoFallback } from "@/lib/playerBranding";
export function TvSplashVisual({logoUrl, leaving=false}:{logoUrl?:string|null;leaving?:boolean}) {
  const slug=window.location.pathname.split("/")[1];
  const fallback=getStationLogoFallback(slug);
  const official=/^positiva(fm)?$/i.test(slug)?"/logos/nexo-positiva-splash-v17.png":null;
  return <div data-nexo-tv-splash role="status" aria-label="Carregando sua experiência" style={{position:"fixed",inset:0,zIndex:9999,background:"#000",color:"#fff",fontFamily:"inherit",pointerEvents:leaving?"none":"auto",opacity:leaving?0:1,transition:"opacity 650ms ease-in-out"}}>
    <style>{`@keyframes nexoSplashEnter{from{opacity:0;transform:translateY(9px)}to{opacity:1;transform:translateY(0)}}@keyframes nexoSplashDots{0%,33%,100%{opacity:.2}12%,22%{opacity:1}}.nexo-splash-item{animation:nexoSplashEnter 650ms ease-out both}.nexo-splash-dots{display:inline-block;animation:nexoSplashDots 1.5s linear infinite}@media(prefers-reduced-motion:reduce){.nexo-splash-item,.nexo-splash-dots{animation:none!important}}`}</style>
    <img className="nexo-splash-item" src={official || logoUrl || fallback || "/images/player-ott-seal-white.png"} alt="Logo da emissora" draggable={false} style={{position:"absolute",left:"40%",top:"29%",width:"20%",height:"33%",objectFit:"contain"}}/>
    <div className="nexo-splash-item" style={{position:"absolute",top:"71%",left:0,width:"100%",textAlign:"center",fontSize:"1.55vw",animationDelay:"100ms"}}>carregando sua experiência <span aria-hidden="true">{[0,1,2].map(i=><span key={i} className="nexo-splash-dots" style={{animationDelay:`${i*500}ms`}}>.</span>)}</span></div>
    <div style={{position:"absolute",bottom:"4.8%",width:"100%",textAlign:"center",opacity:.5,fontSize:".95vw"}}><span className="nexo-splash-item" style={{display:"inline-block",animationDelay:"200ms"}}>desenvolvido por Nexo Brasil - Copyrighted 2026/2027</span></div>
  </div>;
}

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
    const timer = window.setTimeout(() => onFinish(), isPlayerOtt() ? 0 : reducedMotion ? 100 : 650);
    return () => window.clearTimeout(timer);
  }, [fadeOut, reducedMotion, onFinish]);

  const fadeDuration = reducedMotion ? 150 : 650;

  if (isPlayerOtt()) return <TvSplashVisual logoUrl={logoUrl} />;

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
