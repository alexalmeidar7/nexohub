import { useEffect } from "react";

/**
 * useTvFocusAutoScroll
 * ---------------------------------------------------------------
 * Escuta eventos `focusin` no documento e, quando o alvo for um
 * elemento marcado com [data-tv-focusable], rola-o suavemente para
 * a área visível — comportamento essencial em TVs / navegação por
 * controle remoto onde não há mouse para "puxar" o scroll.
 *
 * - Usa `scrollIntoView({ block: "nearest", inline: "nearest" })`
 *   para não empurrar a UI desnecessariamente.
 * - Suporta `data-tv-scroll="center"` para forçar centralização
 *   (útil em carrosséis horizontais).
 * - Faz *throttle* via rAF para evitar jank em navegação rápida.
 */
export function useTvFocusAutoScroll(enabled: boolean = true) {
  useEffect(() => {
    if (!enabled || typeof document === "undefined") return;

    let raf = 0;
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null;
      if (!el || !(el instanceof HTMLElement)) return;
      if (!el.matches?.("[data-tv-focusable]")) return;

      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const mode = el.getAttribute("data-tv-scroll");
        try {
          el.scrollIntoView({
            behavior: "smooth",
            block: mode === "center" ? "center" : "nearest",
            inline: mode === "center" ? "center" : "nearest",
          });
        } catch {
          el.scrollIntoView();
        }
      });
    };

    document.addEventListener("focusin", onFocusIn, true);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("focusin", onFocusIn, true);
    };
  }, [enabled]);
}
