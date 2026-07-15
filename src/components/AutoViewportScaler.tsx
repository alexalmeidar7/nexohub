import { useEffect } from "react";

/**
 * Escala automaticamente o site quando a resolução do usuário é menor
 * que o design base (aprox. 1440x820), garantindo que nada fique cortado
 * em telas 1366x768 e similares.
 *
 * Aplica `zoom` no <html> — funciona nativamente em Chromium/vMix (CEF).
 * Rotas/páginas que já têm sua própria escala (ex.: vMix Broadcast,
 * telas externas rotacionadas, Player Hub em TVs) podem se auto-excluir
 * setando `document.documentElement.dataset.noAutoscale = "1"`.
 */
export default function AutoViewportScaler() {
  useEffect(() => {
    const DESIGN_W = 1440;
    const DESIGN_H = 820;
    const MIN_ZOOM = 0.82;

    const apply = () => {
      try {
        if (document.documentElement.dataset.noAutoscale === "1") {
          (document.documentElement.style as any).zoom = "";
          return;
        }
        const path = window.location.pathname || "";
        // Rotas com escala/roteamento próprio — não interferir
        if (
          path.includes("/broadcast") ||
          path.includes("/vmix") ||
          path.includes("/external") ||
          path.includes("/tv") ||
          path.includes("/xml")
        ) {
          (document.documentElement.style as any).zoom = "";
          return;
        }

        const w = window.innerWidth;
        const h = window.innerHeight;
        if (w <= 0 || h <= 0) return;

        const factor = Math.min(1, w / DESIGN_W, h / DESIGN_H);
        const zoom = Math.max(MIN_ZOOM, factor);

        if (zoom >= 0.999) {
          (document.documentElement.style as any).zoom = "";
        } else {
          (document.documentElement.style as any).zoom = String(
            Math.round(zoom * 1000) / 1000
          );
        }
      } catch {}
    };

    apply();
    window.addEventListener("resize", apply);
    window.addEventListener("orientationchange", apply);
    return () => {
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", apply);
      try {
        (document.documentElement.style as any).zoom = "";
      } catch {}
    };
  }, []);

  return null;
}
