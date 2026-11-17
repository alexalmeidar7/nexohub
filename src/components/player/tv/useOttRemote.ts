import { useEffect, useRef } from "react";

export function useOttRemote(onBack?: () => void, focusKey: unknown = "initial", beforeKey?: () => boolean) {
  const root = useRef<HTMLDivElement>(null);
  const back = useRef(onBack);
  back.current = onBack;
  const intercept = useRef(beforeKey);
  intercept.current = beforeKey;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const scope = root.current?.querySelector<HTMLElement>('[role="dialog"]') || root.current;
      (scope?.querySelector<HTMLElement>('[data-ott-initial]:not(:disabled)') || scope?.querySelector<HTMLElement>('button:not(:disabled), input, select'))?.focus({ preventScroll: true });
    });
    return () => { cancelAnimationFrame(frame); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [focusKey]);
  useEffect(() => {
    const handleBack = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); back.current?.(); };
    const onKey = (event: KeyboardEvent) => {
      const scope = root.current?.querySelector<HTMLElement>('[role="dialog"]') || root.current;
      if (!scope) return;
      const target = document.activeElement as HTMLElement | null;
      const typing = !!target?.matches('input, textarea, select, [contenteditable="true"]');
      if (event.key === "Escape" || event.keyCode === 10009 || event.keyCode === 461 || (event.key === "Backspace" && !typing)) { handleBack(event); return; }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", " "].includes(event.key)) return;
      if (intercept.current?.()) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      // Text fields keep native editing/IME and never trigger parent playback shortcuts.
      if (typing) { event.stopImmediatePropagation(); return; }
      event.preventDefault(); event.stopImmediatePropagation();
      const nodes = Array.from(scope.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled)')).filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
      if (!target || !nodes.includes(target)) { nodes[0]?.focus({ preventScroll: true }); return; }
      if (event.key === "Enter" || event.key === " ") { target.click(); return; }
      const rect = target.getBoundingClientRect(), x = rect.x + rect.width / 2, y = rect.y + rect.height / 2;
      const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight", sign = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
      const candidates = nodes.filter(el => el !== target).map(el => {
        const r = el.getBoundingClientRect(), dx = r.x + r.width / 2 - x, dy = r.y + r.height / 2 - y;
        const distance = (horizontal ? dx : dy) * sign;
        return { el, distance, score: distance + Math.abs(horizontal ? dy : dx) * 2.5 };
      }).filter(item => item.distance > 2).sort((a, b) => a.score - b.score);
      const next = candidates[0]?.el;
      next?.focus({ preventScroll: true });
      if (next?.closest('[data-ott-scroll]')) next.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("nexo:tv-back", handleBack, true);
    return () => { window.removeEventListener("keydown", onKey, true); window.removeEventListener("nexo:tv-back", handleBack, true); };
  }, []);
  return root;
}
