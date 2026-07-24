import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import {
  LAYOUT_VERSION,
  LAYOUT_VERSION_KEY,
  purgeStaleLayoutKeys,
} from "@/lib/layoutVersion";

// Layout cache-bust: single source of truth is src/lib/layoutVersion.ts.
// On version bump, purge stale layout caches once and reload one time.
try {
  const stored = localStorage.getItem(LAYOUT_VERSION_KEY);
  if (stored !== LAYOUT_VERSION) {
    purgeStaleLayoutKeys();
    localStorage.setItem(LAYOUT_VERSION_KEY, LAYOUT_VERSION);
    const RELOAD_FLAG = "__layout_version_reloaded_" + LAYOUT_VERSION;
    if (stored && !sessionStorage.getItem(RELOAD_FLAG)) {
      sessionStorage.setItem(RELOAD_FLAG, "1");
      window.location.reload();
    }
  }
} catch {}

// Chunk-error recovery.
//
// When a dynamically imported chunk fails (typically because a new deploy has
// replaced the hashed asset while the tab was idle), we used to blindly call
// `window.location.reload()`. That is destructive for this app: the Dashboard
// loads its inner panels via internal state, not via routes, so a reload
// sends the user back to the current URL ("/" = Home) and loses the click
// that was in flight. Users report "clicked a page, it reloaded Home".
//
// Instead we:
//   1. let the lazy-retry wrapper in App.tsx retry the import in-place (fast
//      path, no reload, keeps user on the intended panel);
//   2. only fall back to a hard reload after several failures in a short
//      window, and only when the tab is *not* currently visible/interacting,
//      to avoid interrupting a click.
let chunkErrorCount = 0;
let chunkErrorWindowStart = 0;
const CHUNK_ERROR_WINDOW_MS = 30000;
const CHUNK_ERROR_THRESHOLD = 4;
const CHUNK_RELOAD_FLAG = "__chunk_reload_at__";
const CHUNK_RELOAD_COOLDOWN_MS = 60000;

const shouldReloadForChunkError = (errorText: string, source?: string) => {
  const fromBuiltAsset = (source || "").includes("/assets/");
  return (
    errorText.includes("Failed to fetch dynamically imported module") ||
    errorText.includes("Importing a module script failed") ||
    errorText.includes("Loading chunk") ||
    errorText.includes("ChunkLoadError") ||
    (fromBuiltAsset && errorText.includes("Cannot read properties of undefined (reading 'default')"))
  );
};

const handleChunkError = () => {
  const now = Date.now();
  if (now - chunkErrorWindowStart > CHUNK_ERROR_WINDOW_MS) {
    chunkErrorWindowStart = now;
    chunkErrorCount = 0;
  }
  chunkErrorCount += 1;

  // Only hard-reload if we've hit the threshold AND the tab is hidden — this
  // avoids interrupting an in-flight click that would land the user back on
  // Home.
  if (chunkErrorCount < CHUNK_ERROR_THRESHOLD) return;
  if (document.visibilityState === "visible") return;

  const lastReloadAt = Number(sessionStorage.getItem(CHUNK_RELOAD_FLAG) || "0");
  if (now - lastReloadAt < CHUNK_RELOAD_COOLDOWN_MS) return;
  sessionStorage.setItem(CHUNK_RELOAD_FLAG, String(now));
  window.location.reload();
};

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  handleChunkError();
});

window.addEventListener("error", (event) => {
  const message = String(event.message || "");
  const source = String(event.filename || "");
  if (shouldReloadForChunkError(message, source)) {
    event.preventDefault();
    handleChunkError();
  }
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = String((event.reason as Error | string | undefined) ?? "");
  if (shouldReloadForChunkError(reason)) {
    event.preventDefault();
    handleChunkError();
  }
});


createRoot(document.getElementById("root")!).render(<App />);

