import { isPlayerOtt, isPlayerTvApp } from "@/lib/playerTvApp";
import "@/pages/player/PlayerOttWeb.css";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { OttSkeletonPage, type OttSkeletonVariant } from "./OttSkeleton";
import "@/styles/player-ott.css";
import "./OttBrandV73.css";

export function OttBrand() { return <div className="ott-brand"><img src="/images/player-ott-seal-white.png" alt="Nexo OTT Player" /></div>; }
export function OttClientBrand({ logo, name }: { logo?: string | null; name?: string }) {
  return <div className="ott-brand ott-client-brand">{logo ? <img src={logo} alt={name || "Logo da emissora"} /> : <span className="ott-brand-loading-mark" aria-hidden="true" />}</div>;
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
  useEffect(() => {
    // Splash inicial (ott-black) não recebe skeleton nem alteração de imagens.
    if (className.includes("ott-black")) return;
    const frame = root?.current || localRef.current;
    if (!frame) return;
    type Tracked = { url: string; timer: number; finish: () => void };
    const tracked = new Map<HTMLImageElement, Tracked>();
    const forget = (image: HTMLImageElement) => {
      const item = tracked.get(image);
      if (item) {
        window.clearTimeout(item.timer);
        image.removeEventListener("load", item.finish);
        image.removeEventListener("error", item.finish);
        tracked.delete(image);
      }
      image.classList.remove("ott-skeleton-media-pending");
    };
    const scan = () => {
      frame.querySelectorAll<HTMLImageElement>("img").forEach(image => {
        if (image.closest(".ott-backdrop,.ott-presenter-backdrop,.ott-home-artist-cycle,.ott-watch-artist-cycle,.ott-program-sponsors")) return;
        const url = image.currentSrc || image.src;
        const existing = tracked.get(image);
        if (existing && existing.url !== url) forget(image);
        if (image.complete || !url) { if (tracked.has(image)) forget(image); return; }
        if (tracked.has(image)) return;
        const finish = () => forget(image);
        const timer = window.setTimeout(() => {
          if (image.isConnected && !image.complete) image.classList.add("ott-skeleton-media-pending");
        }, 180);
        tracked.set(image, { url, timer, finish });
        image.addEventListener("load", finish);
        image.addEventListener("error", finish);
      });
      for (const image of tracked.keys()) if (!image.isConnected) forget(image);
    };
    scan();
    let scheduled = 0;
    const observer = new MutationObserver(() => { if (!scheduled) scheduled = requestAnimationFrame(() => { scheduled = 0; scan(); }); });
    observer.observe(frame, { childList: true, subtree: true, attributes: true, attributeFilter: ["src", "srcset"] });
    return () => {
      observer.disconnect();
      cancelAnimationFrame(scheduled);
      for (const image of [...tracked.keys()]) forget(image);
    };
  }, [className, root]);
  return <div ref={root || localRef} className={`nexo-tv ${isPlayerOtt() && !isPlayerTvApp() ? "ott-web" : ""} ${typeof window !== "undefined" && /\/positivafm\//i.test(window.location.pathname) ? "ott-positiva" : ""} ${className}${showSkeleton ? " ott-skeleton-active" : ""}`}
    aria-busy={showSkeleton || undefined}
    style={{ "--ott-accent": accent || "var(--player-dominant-color, #eb1b24)" } as CSSProperties}>
    {children}
    {showSkeleton && <OttSkeletonPage variant={skeletonVariant} />}
  </div>;
}
