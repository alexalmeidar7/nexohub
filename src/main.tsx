import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const CHUNK_RELOAD_FLAG = "__chunk_reload_once__";

const shouldReloadForChunkError = (errorText: string) =>
  errorText.includes("Failed to fetch dynamically imported module") ||
  errorText.includes("Importing a module script failed") ||
  errorText.includes("Loading chunk") ||
  errorText.includes("ChunkLoadError");

const reloadOnce = () => {
  if (sessionStorage.getItem(CHUNK_RELOAD_FLAG)) return;
  sessionStorage.setItem(CHUNK_RELOAD_FLAG, "1");
  window.location.reload();
};

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  reloadOnce();
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = String((event.reason as Error | string | undefined) ?? "");
  if (shouldReloadForChunkError(reason)) {
    event.preventDefault();
    reloadOnce();
  }
});

createRoot(document.getElementById("root")!).render(<App />);

