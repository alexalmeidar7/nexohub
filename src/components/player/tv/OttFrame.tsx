import NexoLoadingImage from "./NexoLoadingImage";
import { isPlayerOtt, isPlayerTvApp } from "@/lib/playerTvApp";
import "@/pages/player/PlayerOttWeb.css";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { OttSkeletonPage, type OttSkeletonVariant } from "./OttSkeleton";
import "@/styles/player-ott.css";
import "./OttBrandV73.css";
import "./NexoVisualLote8.css";
import "./NexoGlassLote10.css";
import "./NexoGlassLote11.css";
import "./NexoGlassLote12.css";
import "./NexoGlassLote13.css";
import "./NexoLote14.css";
import "./NexoLote16.css";

export function OttBrand() { return <div className="ott-brand"><img src="/images/player-ott-seal-white.png" alt="Nexo OTT Player" /></div>; }
export function OttClientBrand({ logo, name }: { logo?: string | null; name?: string }) {
  return <div className="ott-brand ott-client-brand">{logo ? <NexoLoadingImage src={logo} alt={name || "Logo da emissora"} /> : <span className="ott-brand-loading-mark" aria-hidden="true" />}</div>;
}
export function OttBackdrop({ image }: { image?: string | null }) {
  const [failed,setFailed]=useState<string|null>(null);
  const visible=!!image&&image!==failed;
  return <div className={`ott-backdrop ${visible?"":"ott-backdrop-fallback"}`} aria-hidden="true">{visible&&<img src={image!} alt="" onError={()=>setFailed(image||null)}/>}<div/></div>;
}
// NEXO_SKELETON_V10: carregamento das telas internas sem modificar o splash.
export function OttFrame({ children, className = "", accent, root, loading = false, skeletonVariant = "generic" }: {
  children: ReactNode; className?: string; accent?: string; root?: React.RefObject<HTMLDivElement>;
  loading?: boolean; skeletonVariant?: OttSkeletonVariant;
}) {
  const localRef = useRef<HTMLDivElement>(null);
  // NEXO_V7_11_SKELETON_SEM_SOBREPOSICAO: failsafe; stream lento nao pode manter a tela inteira coberta.
  const [skeletonDeadlineReached, setSkeletonDeadlineReached] = useState(false);
  useEffect(() => {
    if (!loading || skeletonDeadlineReached) return;
    const timer = window.setTimeout(() => setSkeletonDeadlineReached(true), 6000);
    return () => window.clearTimeout(timer);
  }, [loading, skeletonDeadlineReached]);
  const [firstLoadDone, setFirstLoadDone] = useState(() => !loading);
  const showSkeleton = Boolean(loading && !firstLoadDone && !skeletonDeadlineReached && !className.includes("ott-black"));
  useEffect(() => { if (!loading && !firstLoadDone) setFirstLoadDone(true); }, [loading, firstLoadDone]);
  // Smooth UI: artwork manages its own readiness. Avoid scanning every DOM mutation
  // and applying an animated opacity mask to images that are already being replaced.
  return <div ref={root || localRef} className={`nexo-tv ${isPlayerOtt() && !isPlayerTvApp() ? "ott-web" : ""} ${typeof window !== "undefined" && /\/positivafm\//i.test(window.location.pathname) ? "ott-positiva" : ""} ${className}${showSkeleton ? " ott-skeleton-active" : ""}`}
    aria-busy={showSkeleton || undefined}
    style={{ "--ott-accent": accent || "var(--player-dominant-color, #eb1b24)" } as CSSProperties}>
    {children}
    {showSkeleton && <OttSkeletonPage variant={skeletonVariant} />}
  </div>;
}
