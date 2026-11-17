import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import "./styles/player-tv.css";
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
    // A tela crítica do switcher nunca deve recarregar sozinha.
    // As demais páginas mantêm a recuperação de cache já existente.
    if (
      stored &&
      window.location.pathname !== "/vmix-control/switcher" &&
      !sessionStorage.getItem(RELOAD_FLAG)
    ) {
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
import { recoverFromChunkFailure } from "@/lib/lazyRetry";

const shouldReloadForChunkError = (errorText: string, source?: string) => {
  const fromBuiltAsset = (source || "").includes("/assets/");
  return (
    errorText.includes("Failed to fetch dynamically imported module") ||
    errorText.includes("Importing a module script failed") ||
    errorText.includes("Loading chunk") ||
    errorText.includes("ChunkLoadError") ||
    errorText.includes("error loading dynamically imported module") ||
    errorText.includes("Failed to load module script") ||
    (fromBuiltAsset && errorText.includes("Cannot read properties of undefined (reading 'default')"))
  );
};

window.addEventListener("vite:preloadError", () => {
  // Vite resolves the import as undefined when this event is cancelled.
  // Keep the rejection intact so lazyRetry can retry and report the real error.
  if (window.location.pathname !== "/vmix-control/switcher") {
    recoverFromChunkFailure();
  }
});

window.addEventListener("error", (event) => {
  const message = String(event.message || "");
  const source = String(event.filename || "");
  if (shouldReloadForChunkError(message, source)) {
    event.preventDefault();
    if (window.location.pathname !== "/vmix-control/switcher") {
      recoverFromChunkFailure();
    }
  }
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = String((event.reason as Error | string | undefined) ?? "");
  if (shouldReloadForChunkError(reason)) {
    event.preventDefault();
    if (window.location.pathname !== "/vmix-control/switcher") {
      recoverFromChunkFailure();
    }
  }
});


createRoot(document.getElementById("root")!).render(<App />);

