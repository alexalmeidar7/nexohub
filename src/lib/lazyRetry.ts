import { lazy, type ComponentType, type LazyExoticComponent } from "react";

const CHUNK_RECOVERY_KEY = "__chunk_recovery_at__";
const CHUNK_COUNT_KEY = "__chunk_recovery_count__";
const CHUNK_RECOVERY_WINDOW_MS = 120_000;
const MAX_AUTO_RECOVERIES = 1;
const IMPORT_RETRY_DELAYS_MS = [400, 1_000, 2_000, 4_000];

/**
 * Only messages that unambiguously describe a failed ES module/chunk import.
 * Generic network wording ("load failed", "text/html") used to match here and
 * turned any unrelated failed request into a full page reload loop.
 */
export const isChunkErrorMessage = (message?: string) => {
  const normalized = (message || "").toLowerCase();
  return (
    normalized.includes("failed to fetch dynamically imported module") ||
    normalized.includes("importing a module script failed") ||
    normalized.includes("error loading dynamically imported module") ||
    normalized.includes("loading chunk") ||
    normalized.includes("loading css chunk") ||
    normalized.includes("chunkloaderror") ||
    normalized.includes("failed to load module script")
  );
};

export function recoverFromChunkFailure(force = false): boolean {
  try {
    const now = Date.now();
    const last = Number(sessionStorage.getItem(CHUNK_RECOVERY_KEY) || "0");
    let count = Number(sessionStorage.getItem(CHUNK_COUNT_KEY) || "0");

    if (now - last > CHUNK_RECOVERY_WINDOW_MS) {
      count = 0;
    }

    if (count >= MAX_AUTO_RECOVERIES) {
      return false; // Prevent reload loops
    }

    // Never interrupt the user while the tab is in the foreground unless the
    // caller explicitly forces it (error boundary with a broken screen).
    if (!force && document.visibilityState === "visible") {
      return false;
    }

    sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(now));
    sessionStorage.setItem(CHUNK_COUNT_KEY, String(count + 1));

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
  return lazy(async () => {
    let lastError: unknown;

    for (let attempt = 0; attempt <= IMPORT_RETRY_DELAYS_MS.length; attempt += 1) {
      try {
        return await factory();
      } catch (error) {
        lastError = error;
        const message = String((error as Error)?.message || error);
        if (!isChunkErrorMessage(message)) throw error;

        const delay = IMPORT_RETRY_DELAYS_MS[attempt];
        if (delay === undefined) break;
        await new Promise<void>((resolve) => window.setTimeout(resolve, delay));
      }
    }

    if (recoverFromChunkFailure()) {
      return await new Promise<{ default: T }>(() => {});
    }

    throw lastError;
  });
}