import { useEffect, useState } from "react";

/**
 * Extracts two contrasting colors from an image URL to build an elegant
 * linear-gradient. Mirrors the treatment used on WelcomeScreen so the
 * same palette logic can be reused for avatar / add-profile boxes.
 */
export function useBgPalette(
  backgroundUrl?: string | null,
  fallback: [string, string] = ["rgba(40,40,50,0.85)", "rgba(15,15,20,0.9)"]
) {
  const [bgColors, setBgColors] = useState<[string, string]>(fallback);
  const [prevBgColors, setPrevBgColors] = useState<[string, string] | null>(null);
  const [fadeIn, setFadeIn] = useState(false);

  useEffect(() => {
    if (!backgroundUrl) return;
    let cancelled = false;
    let blobUrl: string | null = null;

    const applyFromImage = (img: HTMLImageElement) => {
      try {
        const c = document.createElement("canvas");
        c.width = 40; c.height = 40;
        const ctx = c.getContext("2d");
        if (!ctx) return false;
        ctx.drawImage(img, 0, 0, 40, 40);
        const sample = (x: number, y: number) => {
          const d = ctx.getImageData(x, y, 1, 1).data;
          return `rgb(${d[0]}, ${d[1]}, ${d[2]})`;
        };
        const next: [string, string] = [sample(8, 10), sample(30, 28)];
        if (cancelled) return true;
        setBgColors((current) => {
          if (current[0] === next[0] && current[1] === next[1]) return current;
          setPrevBgColors(current);
          setFadeIn(false);
          requestAnimationFrame(() => requestAnimationFrame(() => setFadeIn(true)));
          window.setTimeout(() => { if (!cancelled) { setPrevBgColors(null); setFadeIn(false); } }, 1500);
          return next;
        });
        return true;
      } catch {
        return false;
      }
    };

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      if (applyFromImage(img)) return;
      fetch(backgroundUrl, { mode: "cors", cache: "force-cache" })
        .then(r => r.ok ? r.blob() : Promise.reject())
        .then(blob => {
          if (cancelled) return;
          blobUrl = URL.createObjectURL(blob);
          const img2 = new Image();
          img2.onload = () => { if (!cancelled) applyFromImage(img2); };
          img2.src = blobUrl;
        })
        .catch(() => { /* keep previous colors */ });
    };
    img.onerror = () => { /* ignore */ };
    img.src = backgroundUrl;

    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [backgroundUrl]);

  return { bgColors, prevBgColors, fadeIn };
}
