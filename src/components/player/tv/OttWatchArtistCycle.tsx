import OttArtistCrossfade from "./OttArtistCrossfade";
import { useEffect, useState } from "react";
import { fetchArtistImageCached, getArtistImageSync, upgradeArtistImageResolution } from "@/lib/artistImageCache";
import "./OttWatchArtistCycle.css";

/** Mesmo ciclo visual da Home: artista 20s; gradiente 10s.
 * Não interfere na reprodução, no apresentador ou na navegação do /watch. */
export default function OttWatchArtistCycle({ artist }: { artist?: string | null }) {
  const name = (artist || "").trim();
  const [resolved, setResolved] = useState<{name:string;url:string}|null>(null);
  const image = resolved?.url || null;
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let live = true;
    // Preserve the current image while the next artist loads.
    if (!name || /^(break|vinhetas|hora certa|desconhecido)$/i.test(name)) { setResolved(null); return () => { live = false; }; }
    const apply = (url?: string | null) => {
      if (!live || !url) return;
      const upgraded = upgradeArtistImageResolution(url);
      if (upgraded) setResolved(prev=>prev?.name===name && prev.url===upgraded ? prev : {name,url:upgraded});
    };
    apply(getArtistImageSync(name));
    void fetchArtistImageCached(name).then(url=>{if(live && url) apply(url);}).catch(() => {});
    return () => { live = false; };
  }, [name]);

  useEffect(() => {
    if (!image) return;
    const timer = window.setTimeout(() => setVisible(v => !v), visible ? 20000 : 10000);
    return () => window.clearTimeout(timer);
  }, [!!image, visible]);

  return <div className={`ott-watch-artist-cycle${image && visible ? " is-visible" : ""}`} aria-hidden="true">
    <OttArtistCrossfade source={image} />
    <span className="ott-watch-artist-cycle-scrim" />
  </div>;
}
