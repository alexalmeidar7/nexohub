import { useEffect, useState } from "react";

const CACHE_NAME = "nexo-splash-v1";

/**
 * Persistently caches the splash video via the Cache Storage API.
 * Returns null until the cache lookup resolves, so the <video> element
 * mounts with a stable src (either blob: from cache, or the network URL)
 * and never has to reload mid-playback (which caused audio/video desync).
 */
export function useSplashVideoCache(url: string): string | null {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!url) return;
    if (typeof caches === "undefined") {
      setSrc(url);
      return;
    }

    let cancelled = false;
    let objectUrl: string | null = null;

    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        const hit = await cache.match(url);
        if (hit) {
          const blob = await hit.blob();
          objectUrl = URL.createObjectURL(blob);
          if (!cancelled) setSrc(objectUrl);
          return;
        }
        if (!cancelled) setSrc(url);
        // Populate cache in the background for next load
        try {
          const res = await fetch(url, { cache: "force-cache" });
          if (res.ok) await cache.put(url, res.clone());
        } catch {}
      } catch {
        if (!cancelled) setSrc(url);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return src;
}
