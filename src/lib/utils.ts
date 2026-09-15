import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Rola suavemente até o elemento de formulário alvo ou até o topo do container do Dashboard
 */
export function scrollToForm(targetEl?: HTMLElement | null) {
  setTimeout(() => {
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const container = document.querySelector(".mv-content-area, .overflow-y-auto");
    if (container) {
      container.scrollTo({ top: 0, behavior: "smooth" });
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, 50);
}
