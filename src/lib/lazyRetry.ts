import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const CHUNK_RECOVERY_KEY = "__chunk_recovery_at__";
const CHUNK_RECOVERY_COOLDOWN_MS = 60_000;

export const isChunkErrorMessage = (message?: string) => {
  const normalized = (message || "").toLowerCase();
  return (
    normalized.includes("failed to fetch dynamically imported module") ||
    normalized.includes("importing a module script failed") ||
    normalized.includes("error loading dynamically imported module") ||
    normalized.includes("loading chunk") ||
    normalized.includes("loading css chunk") ||
    normalized.includes("chunkloaderror") ||
    normalized.includes("dynamically imported module")
  );
};

export function recoverFromChunkFailure(): boolean {
  try {
    const now = Date.now();
    const last = Number(sessionStorage.getItem(CHUNK_RECOVERY_KEY) || "0");
    if (now - last < CHUNK_RECOVERY_COOLDOWN_MS) return false;

    sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(now));
    const url = new URL(window.location.href);
    url.searchParams.set("_r", String(now));
    window.location.replace(url.toString());
    return true;
  } catch {
    return false;
  }
}

/**
 * React.lazy caches a rejected import forever. Retrying the same mounted lazy
 * component therefore cannot recover after a deployment replaces hashed files.
 * Reload the current URL once when the browser confirms this is a chunk error.
 */
export function lazyRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() =>
    factory().catch((error) => {
      if (isChunkErrorMessage(String((error as Error)?.message || error)) && recoverFromChunkFailure()) {
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }),
  );
}