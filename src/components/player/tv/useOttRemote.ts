import { useEffect, useRef } from "react";

export function useOttRemote(onBack?: () => void, focusKey: unknown = "initial", beforeKey?: () => boolean) {
  const root = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const back = useRef(onBack);
  back.current = onBack;
  const intercept = useRef(beforeKey);
  intercept.current = beforeKey;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const scope = root.current?.querySelector<HTMLElement>('[role="dialog"]') || root.current;
      (scope?.querySelector<HTMLElement>('[data-ott-initial]:not(:disabled)') || scope?.querySelector<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]'))?.focus({ preventScroll: true });
    });
    return () => { cancelAnimationFrame(frame); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [focusKey]);
  useEffect(() => {
    const rememberFocus = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && root.current?.contains(event.target)) lastFocus.current = event.target;
    };
    window.addEventListener("focusin", rememberFocus, true);
    const handleBack = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); back.current?.(); };
    const onKey = (event: KeyboardEvent) => {
      const scope = root.current?.querySelector<HTMLElement>('[role="dialog"]') || root.current;
      if (!scope) return;
      const active = document.activeElement as HTMLElement | null;
      const target = active && scope.contains(active) ? active : lastFocus.current && scope.contains(lastFocus.current) ? lastFocus.current : null;
      if (target && target !== active) target.focus({ preventScroll: true });
      const typing = !!target?.matches('input, textarea, select, [contenteditable="true"]');
      if (event.key === "Escape" || event.keyCode === 10009 || event.keyCode === 461 || (event.key === "Backspace" && !typing)) { handleBack(event); return; }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", " "].includes(event.key)) return;
      if (intercept.current?.()) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      // Text fields keep native editing/IME and never trigger parent playback shortcuts.
      const chat = target?.closest(".ott-player-chat:not([inert])");
      if (chat && target?.matches("textarea") && event.key === "Enter") return;
      const moveBetweenChatFields = chat && (event.key === "ArrowUp" || event.key === "ArrowDown");
      if (typing && !moveBetweenChatFields) { event.stopImmediatePropagation(); return; }
      event.preventDefault(); event.stopImmediatePropagation();
      if(target?.matches('[data-ott-scroll]') && ["ArrowUp","ArrowDown"].includes(event.key)){
        const dir=event.key==="ArrowUp"?-1:1;
        if(dir<0?target.scrollTop>0:target.scrollTop+target.clientHeight<target.scrollHeight-1){target.scrollBy({top:dir*100,behavior:"smooth"});return;}
      }
      const nodes = Array.from((chat || scope).querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),.ott-player-chat textarea:not(:disabled),[tabindex="0"]')).filter(el => !el.closest("[inert]") && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
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
    return () => { window.removeEventListener("focusin", rememberFocus, true); window.removeEventListener("keydown", onKey, true); window.removeEventListener("nexo:tv-back", handleBack, true); };
  }, []);
  return root;
}
