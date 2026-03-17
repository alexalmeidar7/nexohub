import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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

