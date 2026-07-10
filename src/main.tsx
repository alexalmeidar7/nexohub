import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Layout cache-bust: bump this version to force all clients to drop stale layout caches
const LAYOUT_VERSION = "2026-07-10-v2";
const LAYOUT_VERSION_KEY = "__layout_version__";
try {
  const stored = localStorage.getItem(LAYOUT_VERSION_KEY);
  if (stored !== LAYOUT_VERSION) {
    // Clear any cached layout/theme keys from previous versions
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        k.startsWith("layout_") ||
        k.startsWith("layout-") ||
        k.startsWith("dashboard_") ||
        k.startsWith("dashboard-") ||
        k.includes("layout_colors") ||
        k.includes("theme_cache") ||
        k.startsWith("player_layout") ||
        k.startsWith("player-layout")
      ) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    try {
      sessionStorage.clear();
    } catch {}
    localStorage.setItem(LAYOUT_VERSION_KEY, LAYOUT_VERSION);
    // Force a fresh chunk fetch on first load after version bump
    if (!sessionStorage.getItem("__layout_version_reloaded__")) {
      sessionStorage.setItem("__layout_version_reloaded__", "1");
      window.location.reload();
    }
  }
} catch {}

const CHUNK_RELOAD_FLAG = "__chunk_reload_at__";
const CHUNK_RELOAD_COOLDOWN_MS = 15000;

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

const reloadOnce = () => {
  const now = Date.now();
  const lastReloadAt = Number(sessionStorage.getItem(CHUNK_RELOAD_FLAG) || "0");
  if (now - lastReloadAt < CHUNK_RELOAD_COOLDOWN_MS) return;
  sessionStorage.setItem(CHUNK_RELOAD_FLAG, String(now));
  window.location.reload();
};

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadOnce();
});

window.addEventListener("error", (event) => {
  const message = String(event.message || "");
  const source = String(event.filename || "");
  if (shouldReloadForChunkError(message, source)) {
    event.preventDefault();
    reloadOnce();
  }
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = String((event.reason as Error | string | undefined) ?? "");
  if (shouldReloadForChunkError(reason)) {
    event.preventDefault();
    reloadOnce();
  }
});

createRoot(document.getElementById("root")!).render(<App />);

