import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Auto-reload on stale chunk errors (dynamic import failures after deploy)
window.addEventListener("error", (e) => {
  if (e.message?.includes("Failed to fetch dynamically imported module")) {
    console.warn("[CHUNK] Stale chunk detected, reloading…");
    window.location.reload();
  }
});

createRoot(document.getElementById("root")!).render(<App />);
