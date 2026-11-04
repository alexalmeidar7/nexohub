import { useSyncExternalStore } from "react";

export type NotifyVariant = "info" | "success" | "error" | "warning";
export type StatusTone = "success" | "error" | "info";

export interface ActivitySnapshot {
  notice: { id: number; text: string; tone: StatusTone } | null;
  saving: boolean;
  loading: boolean;
}

const NOTICE_MS = 4000;
const ERROR_NOTICE_MS = 6500;
const BUSY_DELAY_MS = 350;
const BUSY_MIN_MS = 700;

let snapshot: ActivitySnapshot = { notice: null, saving: false, loading: false };
const listeners = new Set<() => void>();
let noticeSeq = 0;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;

function publish(next: Partial<ActivitySnapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach((l) => l());
}

export function toneFromVariant(variant?: NotifyVariant): StatusTone {
  if (variant === "success") return "success";
  if (variant === "error") return "error";
  return "info";
}

export function showStatusNotice(text: string, variant?: NotifyVariant) {
  if (!text) return;
  const tone = toneFromVariant(variant);
  noticeSeq += 1;
  if (noticeTimer) clearTimeout(noticeTimer);
  publish({ notice: { id: noticeSeq, text, tone } });
  noticeTimer = setTimeout(() => {
    noticeTimer = null;
    publish({ notice: null });
  }, tone === "error" ? ERROR_NOTICE_MS : NOTICE_MS);
}

export function dismissStatusNotice() {
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = null;
  publish({ notice: null });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useActivityStatus(): ActivitySnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

// Rastreia chamadas ao banco (Supabase REST/Storage): escrita = "gravando", leitura lenta = "recebendo".
function createBusyTracker(key: "saving" | "loading") {
  let active = 0;
  let shownAt = 0;
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  const start = () => {
    active += 1;
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
    if (active === 1 && !snapshot[key] && !showTimer) {
      showTimer = setTimeout(() => {
        showTimer = null;
        if (active > 0) {
          shownAt = Date.now();
          publish({ [key]: true } as Partial<ActivitySnapshot>);
        }
      }, key === "saving" ? 0 : BUSY_DELAY_MS);
    }
  };

  const end = () => {
    active = Math.max(0, active - 1);
    if (active > 0) return;
    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
    if (snapshot[key]) {
      const wait = Math.max(0, BUSY_MIN_MS - (Date.now() - shownAt));
      hideTimer = setTimeout(() => {
        hideTimer = null;
        if (active === 0) publish({ [key]: false } as Partial<ActivitySnapshot>);
      }, wait);
    }
  };

  return { start, end };
}

function classifyRequest(input: RequestInfo | URL, init?: RequestInit): "saving" | "loading" | null {
  let url = "";
  let method = (init?.method || "GET").toUpperCase();
  if (typeof input === "string") url = input;
  else if (input instanceof URL) url = input.toString();
  else {
    url = input.url;
    if (!init?.method) method = (input.method || "GET").toUpperCase();
  }
  if (!/\.supabase\.(co|in)\//.test(url)) return null;
  if (!/\/(rest|storage)\/v1\//.test(url)) return null;
  if (/\/rest\/v1\/rpc\//.test(url)) return null;
  return method === "GET" || method === "HEAD" ? "loading" : "saving";
}

export function initActivityMonitor() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;

  window.addEventListener("nexo-notify", (e: Event) => {
    const detail = (e as CustomEvent<{ text?: string; variant?: NotifyVariant }>).detail;
    if (detail?.text) showStatusNotice(detail.text, detail.variant);
  });

  const trackers = { saving: createBusyTracker("saving"), loading: createBusyTracker("loading") };
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const kind = classifyRequest(input, init);
    if (!kind) return originalFetch(input, init);
    const tracker = trackers[kind];
    tracker.start();
    return originalFetch(input, init).finally(tracker.end);
  };
}
