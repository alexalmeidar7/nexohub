import { isPlayerOtt, isPlayerTvApp } from "@/lib/playerTvApp";
import { useEffect, useRef } from "react";

export function useOttRemote(onBack?: () => void, focusKey: unknown = "initial", beforeKey?: () => boolean) {
  const root = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const back = useRef(onBack);
  back.current = onBack;
  const intercept = useRef(beforeKey);
  intercept.current = beforeKey;
  useEffect(() => {
    if (isPlayerOtt() && !isPlayerTvApp()) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      const scope = root.current?.querySelector<HTMLElement>('[data-nexo-program-details]') || root.current?.querySelector<HTMLElement>('[role="dialog"]') || root.current;
      (scope?.querySelector<HTMLElement>('.nexo-grade-programa[data-ao-vivo="true"]') || scope?.querySelector<HTMLElement>('.ott-video .ott-interactivity-button:not(:disabled)') || (scope?.matches('.ott-video') ? scope.querySelector<HTMLElement>('.ott-interactivity-button:not(:disabled)') : null) || scope?.querySelector<HTMLElement>('[data-ott-initial]:not(:disabled)') || scope?.querySelector<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]'))?.focus({ preventScroll: true });
    });
    return () => { cancelAnimationFrame(frame); if (previous?.isConnected) previous.focus({ preventScroll: true }); };
  }, [focusKey]);
  useEffect(() => {
    const rememberFocus = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && root.current?.contains(event.target)) lastFocus.current = event.target;
    };
    window.addEventListener("focusin", rememberFocus, true);
    const handleBack = (event: Event) => { if(document.querySelector(".nexo-tv-commercial-playback"))return; event.preventDefault(); event.stopImmediatePropagation(); const detail=root.current?.querySelector<HTMLButtonElement>('[data-nexo-detail-close]');if(detail){detail.click();return;}back.current?.(); };
    const onKey = (event: KeyboardEvent) => {
      if(document.querySelector(".nexo-tv-commercial-playback"))return;
      // NEXO_CEP_PORTAL_KEYBOARD_20261121
      // O popup de CEP usa portal fora do Player. Nunca roubar foco/teclas dele.
      if (event.target instanceof Element && event.target.closest('.nexo-tv-cep-overlay')) return;
      const scope = root.current?.querySelector<HTMLElement>('[data-nexo-program-details]') || root.current?.querySelector<HTMLElement>('[role="dialog"]') || root.current;
      if (!scope) return;
      const web = isPlayerOtt() && !isPlayerTvApp();
      if (web && (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.isComposing || (event.target instanceof Element && !scope.contains(event.target) && event.key !== "Escape"))) return;
      const active = document.activeElement as HTMLElement | null;
      const target = active && scope.contains(active) ? active : lastFocus.current && scope.contains(lastFocus.current) ? lastFocus.current : null;
      if (!web && target && target !== active) target.focus({ preventScroll: true });
      const typing = !!target?.matches('input, textarea, select, [contenteditable="true"]');
      // Busca da Home: D-pad desce aos resultados; OK abre o primeiro item.
      if (typing && target?.matches('.ott-home-search-input') && (event.key === 'ArrowDown' || event.key === 'Enter')) {
        const first = scope.querySelector<HTMLButtonElement>('.ott-home-search-results button:not(:disabled)');
        if (first) {
          event.preventDefault(); event.stopImmediatePropagation();
          if (event.key === 'Enter') first.click(); else first.focus({ preventScroll: true });
          return;
        }
      }
      if (web && event.key !== "Escape") return;
      if (event.key === "Escape" || event.keyCode === 10009 || event.keyCode === 461 || (event.key === "Backspace" && !typing)) { handleBack(event); return; }
      if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Enter", " "].includes(event.key)) return;
      if (intercept.current?.()) { event.preventDefault(); event.stopImmediatePropagation(); return; }
      // Text fields keep native editing/IME and never trigger parent playback shortcuts.
      const chat = target?.closest(".ott-player-chat:not([inert])");
      if (chat && target?.matches("textarea") && event.key === "Enter") return;
      const moveBetweenChatFields = chat && (event.key === "ArrowUp" || event.key === "ArrowDown");
      if (typing && !moveBetweenChatFields) { event.stopImmediatePropagation(); return; }
      // NEXO_V7_1_WEATHER_NAV: Up/Down tambem avanca nos dias, mostrando os seguintes.
      if(target?.matches('[data-forecast-card]') && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)) {
       const cards=Array.from(scope.querySelectorAll<HTMLElement>('[data-forecast-card]')).filter(el=>el.getClientRects().length>0);
       const index=cards.indexOf(target);
       if(index>=0){
        event.preventDefault();event.stopImmediatePropagation();
        const dir=event.key==='ArrowDown'||event.key==='ArrowRight'?1:-1;
        const next=cards[Math.max(0,Math.min(cards.length-1,index+dir))];
        next?.focus({preventScroll:true});next?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'smooth'});return;
       }
      }
      if (target?.closest('.nexo-grade-rolagem') && target.matches('.nexo-grade-programa') && event.key.startsWith('Arrow')) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if(target?.matches('[data-ott-scroll]') && ["ArrowUp","ArrowDown"].includes(event.key)){
        const dir=event.key==="ArrowUp"?-1:1;
        if(dir<0?target.scrollTop>0:target.scrollTop+target.clientHeight<target.scrollHeight-1){target.scrollBy({top:dir*100,behavior:"smooth"});return;}
      }
      const nodes = Array.from((chat || scope).querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),.ott-player-chat textarea:not(:disabled),[tabindex="0"]')).filter(el => !el.closest("[inert]") && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden");
      if (!target || !nodes.includes(target)) { nodes[0]?.focus({ preventScroll: true }); return; }
      if (event.key === "Enter" || event.key === " ") { target.click(); return; }
      if (target.closest(".nexo-history-carousel") && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
        const selector = event.key === "ArrowUp" ? ".nexo-history-up" : ".nexo-history-controls button";
        const button = target.closest(".nexo-history-carousel")?.querySelector<HTMLButtonElement>(selector);
        if (button && !button.disabled && button.getAttribute("aria-disabled") !== "true") button.click();
        return;
      }
      const rail = scope.querySelector<HTMLElement>(".ott-home-rail");
      if (rail) {
        const menu = Array.from(rail.querySelectorAll<HTMLElement>(".ott-home-rail-button:not(:disabled),.ott-home-rail-profile"));
        const index = menu.indexOf(target);
        const mini = scope.querySelector<HTMLElement>(".ott-header-track");
        if (target === mini && event.key === "ArrowDown") { menu[0]?.focus({preventScroll:true}); return; }
        if (index >= 0 && event.key === "ArrowRight") { scope.querySelector<HTMLElement>(".ott-now-grade")?.focus({preventScroll:true}); return; }
        if (index >= 0 && event.key === "ArrowDown") { menu[Math.min(index+1,menu.length-1)]?.focus({preventScroll:true}); return; }
        if (index >= 0 && event.key === "ArrowUp") { (index === 0 ? mini : menu[index-1])?.focus({preventScroll:true}); return; }
      }
      const tray = scope.querySelector<HTMLElement>(".ott-positiva-channel-tray");
      if (tray && event.key === "ArrowDown" && target.matches(".ott-play,.ott-open-schedule,.ott-watch-program")) {
        (tray.querySelector<HTMLElement>('[aria-pressed="true"]') || tray.querySelector<HTMLElement>("button"))?.focus({preventScroll:true}); return;
      }
      if (tray && target.closest(".ott-positiva-channel-tray") && event.key === "ArrowUp") {
        scope.querySelector<HTMLElement>(".ott-play")?.focus({preventScroll:true}); return;
      }
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
