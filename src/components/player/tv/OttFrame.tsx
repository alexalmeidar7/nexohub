import { useState, type CSSProperties, type ReactNode } from "react";
import "@/styles/player-ott.css";

export function OttBrand() { return <div className="ott-brand"><img src="/images/player-ott-seal-white.png" alt="Nexo OTT Player" /></div>; }
export function OttClientBrand({ logo, name }: { logo?: string | null; name?: string }) {
  return <div className="ott-brand ott-client-brand">{logo ? <img src={logo} alt={name || "Logo da emissora"} /> : <span>{name || "Sua rádio"}</span>}</div>;
}
export function OttBackdrop({ image }: { image?: string | null }) {
  const [failed,setFailed]=useState<string|null>(null);
  const visible=!!image&&image!==failed;
  return <div className={`ott-backdrop ${visible?"":"ott-backdrop-fallback"}`} aria-hidden="true">{visible&&<img src={image!} alt="" onError={()=>setFailed(image||null)}/>}<div/></div>;
}
export function OttFrame({ children, className = "", accent, root }: { children: ReactNode; className?: string; accent?: string; root?: React.RefObject<HTMLDivElement> }) {
  return <div ref={root} className={`nexo-tv ${className}`} style={{ "--ott-accent": accent || "var(--player-dominant-color, #eb1b24)" } as CSSProperties}>{children}</div>;
}
