import { isPlayerOtt, isPlayerTvApp } from "@/lib/playerTvApp";
import { useEffect, useRef } from "react";

export function useOttRemote(onBack?: () => void, focusKey: unknown = "initial", beforeKey?: () => boolean) {
  const root = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const homeWasVisible = useRef(false);
  const homeAwaitingInput = useRef(false);
  const back = useRef(onBack);
  back.current = onBack;
  const intercept = useRef(beforeKey);
  intercept.current = beforeKey;
  useEffect(() => {
    // nexo-lote8-home-focus: no automatic focus when entering the Home.
    const host = root.current;
    const home = !!host?.matches('.ott-home.ott-rail-layout');
    if (home && !homeWasVisible.current) {
      homeAwaitingInput.current = true;
      lastFocus.current = null;
      host?.setAttribute('data-nexo-home-awaiting-focus','true');
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && host?.contains(focused)) focused.blur();
    }
    if (!home) { homeAwaitingInput.current = false; host?.removeAttribute('data-nexo-home-awaiting-focus'); }
    homeWasVisible.current = home;
    if (isPlayerOtt() && !isPlayerTvApp()) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      if (root.current?.matches(".ott-video") && focusKey === false) return;
      if (homeAwaitingInput.current && !root.current?.querySelector('[role="dialog"], [data-nexo-program-details]')) return;
      const scope = root.current?.querySelector<HTMLElement>('[data-nexo-program-details]') || root.current?.querySelector<HTMLElement>('[role="dialog"]') || root.current;
      (scope?.querySelector<HTMLElement>('.ott-watch-chrome[aria-hidden="false"] .ott-play:not(:disabled)') || scope?.querySelector<HTMLElement>('.nexo-grade-programa[data-ao-vivo="true"]') || scope?.querySelector<HTMLElement>('.ott-video .ott-interactivity-button:not(:disabled)') || (scope?.matches('.ott-video') ? scope.querySelector<HTMLElement>('.ott-interactivity-button:not(:disabled)') : null) || scope?.querySelector<HTMLElement>('[data-ott-initial]:not(:disabled)') || scope?.querySelector<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]'))?.focus({ preventScroll: true });
    });
    return () => { cancelAnimationFrame(frame); if (!homeAwaitingInput.current && previous?.isConnected && !previous.closest('[aria-hidden="true"], [inert]')) previous.focus({ preventScroll: true }); };
  }, [focusKey]);
  useEffect(() => {
    const rememberFocus = (event: FocusEvent) => {
      if (event.target instanceof HTMLElement && root.current?.contains(event.target)) lastFocus.current = event.target;
    };
    window.addEventListener("focusin", rememberFocus, true);
    const activateHomeByPointer = (event: PointerEvent) => {
      if (homeAwaitingInput.current && event.target instanceof Element && root.current?.contains(event.target)) {
        homeAwaitingInput.current=false;root.current?.removeAttribute('data-nexo-home-awaiting-focus');
      }
    };
    window.addEventListener('pointerdown',activateHomeByPointer,true);
    const handleBack = (event: Event) => { if(document.querySelector(".nexo-tv-commercial-playback"))return; event.preventDefault(); event.stopImmediatePropagation(); const detail=root.current?.querySelector<HTMLButtonElement>('[data-nexo-detail-close]');if(detail){detail.click();return;}back.current?.(); };
    const onKey = (event: KeyboardEvent) => {
      if(document.querySelector(".nexo-tv-commercial-playback"))return;
      // NEXO_CEP_PORTAL_KEYBOARD_20261121
      // O popup de CEP usa portal fora do Player. Nunca roubar foco/teclas dele.
      if (event.target instanceof Element && event.target.closest('.nexo-tv-cep-overlay')) return;
      const scope = root.current?.querySelector<HTMLElement>('[data-nexo-program-details]') || root.current?.querySelector<HTMLElement>('[role="dialog"]') || root.current;
      if (!scope) return;
      const web = isPlayerOtt() && !isPlayerTvApp();
      if (homeAwaitingInput.current && scope === root.current && scope.matches('.ott-home.ott-rail-layout') && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Enter',' '].includes(event.key) && !event.defaultPrevented && !event.altKey && !event.ctrlKey && !event.metaKey && !event.isComposing && !(event.target instanceof Element && event.target.closest('input,textarea,select,[contenteditable="true"]'))) {
        if (web && event.target instanceof Element && event.target !== document.body && event.target !== document.documentElement && !scope.contains(event.target)) return;
        event.preventDefault();event.stopImmediatePropagation();
        const listen=scope.querySelector<HTMLButtonElement>('.ott-home-rail-button[aria-label="Ouvir"]:not(:disabled)');
        if(listen){homeAwaitingInput.current=false;scope.removeAttribute('data-nexo-home-awaiting-focus');listen.focus({preventScroll:true});}
        return;
      }
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
      const nodes = Array.from((chat || scope).querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),.ott-player-chat textarea:not(:disabled),[tabindex="0"]')).filter(el => !el.closest("[inert]") && el.getClientRects().length && getComputedStyle(el).visibility !== "hidden" && !el.closest('[aria-hidden="true"]') && el.getAttribute("aria-disabled") !== "true" && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0);
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
        const menu = nodes.filter(el => rail.contains(el) && el.matches(".ott-home-rail-button,.ott-home-rail-profile"));
        const grade = scope.querySelector<HTMLElement>(".ott-now-grade");
        const banner = scope.querySelector<HTMLElement>(".nexo-home-commercial-trigger");
        const destinations = [grade, banner].filter((el): el is HTMLElement => !!el && nodes.includes(el));
        const nearestY = (items: HTMLElement[]) => {
          const r = target.getBoundingClientRect(), y = r.top + r.height / 2;
          return items.reduce<HTMLElement | undefined>((best, el) => {
            const delta = (node: HTMLElement) => { const b = node.getBoundingClientRect(); return Math.abs(b.top + b.height / 2 - y); };
            return !best || delta(el) < delta(best) ? el : best;
          }, undefined);
        };
        if (menu.includes(target)) {
          if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            const ordered = [...menu].sort((a,b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
            ordered[ordered.indexOf(target) + (event.key === "ArrowUp" ? -1 : 1)]?.focus({preventScroll:true}); return;
          }
          if (event.key === "ArrowRight") nearestY(destinations)?.focus({preventScroll:true});
          return;
        }
        if (destinations.includes(target)) {
          if (event.key === "ArrowLeft") { nearestY(menu)?.focus({preventScroll:true}); return; }
          if (event.key === "ArrowDown" && target === grade) { if (banner && nodes.includes(banner)) banner.focus({preventScroll:true}); return; }
          if (event.key === "ArrowUp" && target === banner) { if (grade && nodes.includes(grade)) grade.focus({preventScroll:true}); return; }
        }
      }
      // Audio transport: vertical arrows stay inside channel selector.
      if (scope.matches(".ott-audio") && target.matches(".ott-play,.ott-channel-up,.ott-open-schedule") && ["ArrowUp","ArrowDown"].includes(event.key)) {
        const play = scope.querySelector<HTMLElement>(".ott-play");
        const up = scope.querySelector<HTMLElement>(".ott-channel-up");
        const down = scope.querySelector<HTMLElement>('.ott-open-schedule[aria-label="Próximo canal"]');
        const next = target === play ? (event.key === "ArrowUp" ? up : down) : target === up && event.key === "ArrowDown" || target === down && event.key === "ArrowUp" ? play : null;
        if(next && nodes.includes(next)) next.focus({preventScroll:true});
        return;
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
        const overlap = horizontal ? Math.min(rect.bottom,r.bottom)-Math.max(rect.top,r.top) : Math.min(rect.right,r.right)-Math.max(rect.left,r.left);
        const crossGap = Math.max(0,-overlap);
        // Prefer targets sharing the current row/column, then the nearest diagonal.
        return { el, distance, aligned: overlap > 0, score: distance + crossGap * 3 + Math.abs(horizontal ? dy : dx) * .25 };
      }).filter(item => item.distance > 2).sort((a, b) => Number(b.aligned)-Number(a.aligned) || a.score - b.score);
      const next = candidates[0]?.el;
      next?.focus({ preventScroll: true });
      if (next?.closest('[data-ott-scroll]')) next.scrollIntoView({ block: "nearest", inline: "nearest" });
    };
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("nexo:tv-back", handleBack, true);
    return () => { window.removeEventListener("focusin", rememberFocus, true); window.removeEventListener("pointerdown",activateHomeByPointer,true); window.removeEventListener("keydown", onKey, true); window.removeEventListener("nexo:tv-back", handleBack, true); };
  }, []);
  return root;
}
