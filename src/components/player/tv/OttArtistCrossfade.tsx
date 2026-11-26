import { useEffect, useState } from "react";
import "./OttArtistCrossfade.css";

/** Keep the previous decoded photo visible until the next one has faded in. */
export default function OttArtistCrossfade({ source }: { source?: string | null }) {
  const [active, setActive] = useState<string | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);

  useEffect(() => {
    if (!source || source === active) return;
    let cancelled = false;
    const img = new Image();
    const reveal = async () => {
      try { await img.decode?.(); } catch { /* already loaded or decode unsupported */ }
      if (!cancelled) { setPrevious(active); setActive(source); }
    };
    img.onload = () => { void reveal(); };
    img.onerror = () => { /* preserve the previous image, never flash black */ };
    img.src = source;
    return () => { cancelled = true; img.onload = null; img.onerror = null; };
  }, [source, active]);

  useEffect(() => {
    if (!previous) return;
    const timeout = window.setTimeout(() => setPrevious(null), 1600);
    return () => window.clearTimeout(timeout);
  }, [previous, active]);

  return <div className="ott-artist-crossfade" aria-hidden="true">
    {previous && previous !== active && <img key={previous} className="ott-artist-crossfade-previous" src={previous} alt="" decoding="async" />}
    {active && <img key={active} className="ott-artist-crossfade-current" src={active} alt="" decoding="async" />}
  </div>;
}
