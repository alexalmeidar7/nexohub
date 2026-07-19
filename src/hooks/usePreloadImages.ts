import { useEffect, useState } from "react";

// Module-level cache of URLs that have finished decoding at least once.
// Once cached, they are considered instantly available on subsequent mounts.
const decodedCache = new Set<string>();

// Keep a strong reference to preloaded Image objects so the browser
// doesn't evict them from memory before they're used.
const imageRefs = new Map<string, HTMLImageElement>();

export function preloadImage(url: string): Promise<void> {
  if (!url) return Promise.resolve();
  if (decodedCache.has(url)) return Promise.resolve();
  const existing = imageRefs.get(url);
  if (existing && existing.complete) {
    decodedCache.add(url);
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    const img = new Image();
    img.decoding = "async";
    (img as any).fetchPriority = "high";
    img.crossOrigin = "anonymous";
    img.onload = async () => {
      try { await (img as any).decode?.(); } catch { /* ignore */ }
      decodedCache.add(url);
      resolve();
    };
    img.onerror = () => resolve(); // don't block on failure
    imageRefs.set(url, img);
    img.src = url;
  });
}

/**
 * Preloads a list of image URLs and returns only the ones that are
 * fully decoded. Prevents flicker on cross-fade transitions.
 */
export function usePreloadedImages(urls: (string | null | undefined)[]): string[] {
  const key = urls.filter(Boolean).join("|");
  const initial = urls.filter((u): u is string => !!u && decodedCache.has(u));
  const [ready, setReady] = useState<string[]>(initial);

  useEffect(() => {
    let cancelled = false;
    const list = urls.filter((u): u is string => !!u);
    // Seed with any already cached URLs so they never flash out.
    setReady((prev) => {
      const seed = list.filter((u) => decodedCache.has(u));
      // preserve order stability: only update if different
      if (prev.length === seed.length && prev.every((v, i) => v === seed[i])) return prev;
      return seed;
    });
    Promise.all(
      list.map((url) =>
        preloadImage(url).then(() => {
          if (cancelled) return;
          setReady((prev) => (prev.includes(url) ? prev : [...prev, url]));
        })
      )
    );
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Preserve original order from `urls`
  return urls.filter((u): u is string => !!u && ready.includes(u));
}
