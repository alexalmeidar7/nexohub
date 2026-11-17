import type { CSSProperties, ReactNode } from "react";
import "@/styles/player-ott.css";

export function OttBrand() { return <div className="ott-brand"><img src="/images/player-ott-seal-white.png" alt="Nexo OTT Player" /></div>; }
export function OttBackdrop({ image }: { image?: string | null }) { return <div className="ott-backdrop" aria-hidden="true">{image && <img src={image} alt="" />}<div /></div>; }
export function OttFrame({ children, className = "", accent, root }: { children: ReactNode; className?: string; accent?: string; root?: React.RefObject<HTMLDivElement> }) {
  const positiva = /(?:^|\/)positivafm(?:\/|$)/i.test(window.location.pathname);
  return <div ref={root} className={`nexo-tv ${className}`} style={{ "--ott-accent": positiva ? "#ef202b" : accent || "var(--player-dominant-color, #eb1b24)" } as CSSProperties}>{children}</div>;
}
