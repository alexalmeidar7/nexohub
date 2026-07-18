import { useEffect, useState } from "react";
import splashVideoAsset from "@/assets/nexo_player_splash.mp4.asset.json";

const CACHE_NAME = "nexo-splash-v1";

// Origem canônica onde a CDN de assets da Lovable (/__l5e/...) é servida.
// Em domínios customizados/externos essa rota não existe e retorna HTML,
// então precisamos apontar para a origem publicada oficial.
const CANONICAL_ASSET_ORIGIN = "https://nexohub.lovable.app";

export function resolveSplashUrl(rawUrl: string = splashVideoAsset.url): string {
  if (!rawUrl) return rawUrl;
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl;
  if (rawUrl.startsWith("/__l5e/")) return CANONICAL_ASSET_ORIGIN + rawUrl;
  if (typeof window !== "undefined") {
    try { return new URL(rawUrl, window.location.origin).toString(); } catch {}
  }
  return rawUrl;
}


/**
 * Module-scoped prefetch state so that:
 *   - The prefetcher (called on route entry) and the hook (called by
 *     <SplashScreen />) never issue duplicate network requests.
 *   - The blob URL is reused across mounts, so the <video> element gets a
 *     stable src immediately if the splash was warmed ahead of time.
 */
let sharedPromise: Promise<string> | null = null;
let sharedResolved: string | null = null;
let sharedObjectUrl: string | null = null;

async function loadSplash(url: string): Promise<string> {
  if (typeof caches === "undefined") return url;
  try {
    const cache = await caches.open(CACHE_NAME);
    const hit = await cache.match(url);
    if (hit) {
      const blob = await hit.blob();
      sharedObjectUrl = URL.createObjectURL(blob);
      return sharedObjectUrl;
    }
    // Not cached yet — fetch, persist for next load, and return an object URL
    // built from the same response so we don't pay for two downloads.
    const res = await fetch(url, { cache: "force-cache" });
    if (!res.ok) return url;
    const buf = await res.clone().arrayBuffer();
    try {
      await cache.put(url, res);
    } catch {}
    const blob = new Blob([buf], {
      type: res.headers.get("Content-Type") || "video/mp4",
    });
    sharedObjectUrl = URL.createObjectURL(blob);
    return sharedObjectUrl;
  } catch {
    return url;
  }
}

/**
 * Kick off the splash download as early as possible (e.g. as soon as the
 * player route is entered) so the <video> element in <SplashScreen /> can
 * mount with a ready-to-play blob URL and start immediately.
 * Safe to call many times — the work is deduped.
 */
export function prefetchSplashVideo(url: string = splashVideoAsset.url): Promise<string> {
  if (sharedResolved) return Promise.resolve(sharedResolved);
  if (sharedPromise) return sharedPromise;
  sharedPromise = loadSplash(url).then((src) => {
    sharedResolved = src;
    return src;
  });
  return sharedPromise;
}

/**
 * Persistently caches the splash video via the Cache Storage API.
 * Returns null until the cache/prefetch lookup resolves, so the <video>
 * element mounts with a stable src (either blob: from cache, or the network
 * URL) and never has to reload mid-playback (which caused audio/video desync).
 */
export function useSplashVideoCache(url: string): string | null {
  // Retorna a URL bruta imediatamente para o <video> começar a carregar sem
  // depender do Cache Storage (que pode falhar por CORS/embedded browsers).
  // O prefetch para blob acontece em paralelo apenas para acelerar próximos acessos.
  const [src, setSrc] = useState<string | null>(sharedResolved || url || null);

  useEffect(() => {
    if (!url) return;
    if (sharedResolved) {
      setSrc(sharedResolved);
      return;
    }
    let cancelled = false;
    prefetchSplashVideo(url).then((resolved) => {
      // Só troca para o blob se ainda estivermos usando a URL crua e o
      // resolvido for de fato um blob: (evita re-carregar o vídeo no meio).
      if (!cancelled && resolved && resolved.startsWith("blob:")) {
        setSrc((prev) => (prev && prev.startsWith("blob:") ? prev : resolved));
      }
    }).catch(() => { /* mantém a URL crua */ });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return src;
}

// Best-effort cleanup on page unload (browsers usually collect anyway).
if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => {
    if (sharedObjectUrl) {
      try {
        URL.revokeObjectURL(sharedObjectUrl);
      } catch {}
    }
  });
}
