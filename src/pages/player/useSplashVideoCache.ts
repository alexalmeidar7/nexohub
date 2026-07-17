import { useEffect, useState } from "react";

const CACHE_NAME = "nexo-splash-v1";

/**
 * Persistently caches the splash video via the Cache Storage API.
 * On first load: fetches from network, stores in cache, returns the original URL.
 * On subsequent loads: reads from cache and returns a blob: URL for instant playback.
 */
export function useSplashVideoCache(url: string): string {
  const [src, setSrc] = useState<string>(url);

  useEffect(() => {
    if (!url || typeof caches === "undefined") return;
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
        // Miss: fetch + store in background; keep original URL for immediate playback
        const res = await fetch(url, { cache: "force-cache" });
        if (res.ok) {
          try {
            await cache.put(url, res.clone());
          } catch {}
        }
      } catch {
        // Ignore cache errors; fall back to network URL already set
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);

  return src;
}
