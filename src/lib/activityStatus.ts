import { useSyncExternalStore } from "react";

export type NotifyVariant = "info" | "success" | "error" | "warning";
export type StatusTone = "success" | "error" | "info";
export type DataOrigin = "online" | "local";
export type DataOperation = "read" | "write";
export interface DataActivity {
  read: number;
  write: number;
}
export interface ActivitySnapshot {
  notice: { id: number; text: string; tone: StatusTone } | null;
  /** Kept for backward compatibility with activity consumers. */
  saving: boolean;
  loading: boolean;
  active: Record<DataOrigin, DataActivity>;
  lastByOrigin: Record<DataOrigin, { operation: DataOperation; at: number } | null>;
  lastSyncAt: number | null;
}

const NOTICE_MS = 4000;
const ERROR_NOTICE_MS = 6500;
const BUSY_DELAY_MS = 250;
const MAX_BUSY_MS = 20_000;

let snapshot: ActivitySnapshot = {
  notice: null, saving: false, loading: false,
  active: { online: { read: 0, write: 0 }, local: { read: 0, write: 0 } },
  lastByOrigin: { online: null, local: null }, lastSyncAt: null,
};
const listeners = new Set<() => void>();
let noticeSeq = 0;
let requestSeq = 0;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let initialized = false;
type Tracker = { origin: DataOrigin; operation: DataOperation; shown: boolean; reveal: ReturnType<typeof setTimeout>; watchdog: ReturnType<typeof setTimeout> };
const running = new Map<number, Tracker>();
const nativeOperations = new Map<string, number>();

function publish(next: Partial<ActivitySnapshot>) {
  snapshot = { ...snapshot, ...next };
  listeners.forEach(listener => listener());
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
  return () => { listeners.delete(listener); };
}
export function useActivityStatus(): ActivitySnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}
function publishActivity() {
  const active: ActivitySnapshot["active"] = {
    online: { read: 0, write: 0 },
    local: { read: 0, write: 0 },
  };
  for (const tracker of running.values()) {
    if (tracker.shown) active[tracker.origin][tracker.operation] += 1;
  }
  publish({
    active,
    saving: active.online.write + active.local.write > 0,
    loading: active.online.read + active.local.read > 0,
  });
}
/** One token for one real transport operation; cached reads never reach this path. */
export function beginDataActivity(origin: DataOrigin, operation: DataOperation) {
  const id = ++requestSeq;
  const tracker: Tracker = {
    origin, operation, shown: false,
    reveal: null as unknown as ReturnType<typeof setTimeout>,
    watchdog: null as unknown as ReturnType<typeof setTimeout>,
  };
  tracker.reveal = setTimeout(() => {
    if (!running.has(id)) return;
    tracker.shown = true;
    publishActivity();
  }, BUSY_DELAY_MS);
  // A stalled request cannot leave the badge spinning for hours. This only
  // expires the indicator, it does NOT cancel the underlying request/write.
  tracker.watchdog = setTimeout(() => { finishDataActivity(id, false); }, MAX_BUSY_MS);
  running.set(id, tracker);
  return id;
}
export function finishDataActivity(id: number, success: boolean) {
  const tracker = running.get(id);
  if (!tracker) return;
  running.delete(id);
  clearTimeout(tracker.reveal);
  clearTimeout(tracker.watchdog);
  const now = Date.now();
  if (success) {
    publish({
      lastSyncAt: now,
      lastByOrigin: {
        ...snapshot.lastByOrigin,
        [tracker.origin]: { operation: tracker.operation, at: now },
      },
    });
  }
  if (tracker.shown) publishActivity();
}

export function classifyDataRequest(
  input: RequestInfo | URL,
  init: RequestInit = {},
  desktop = false,
): { origin: DataOrigin; operation: DataOperation } | null {
  const urlString = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  let url: URL;
  try { url = new URL(urlString); } catch { return null; }
  const source = typeof input === "string" || input instanceof URL ? null : input;
  const method = (init.method || source?.method || "GET").toUpperCase();
  const readMethod = method === "GET" || method === "HEAD";
  const writeMethod = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
  if (desktop && ((["localhost", "127.0.0.1"].includes(url.hostname) && url.port === "8787") ||
      url.protocol === "housemix-local:")) {
    if (url.pathname.startsWith("/v1/sync/")) return { origin: "local", operation: readMethod ? "read" : "write" };
    if (url.pathname.startsWith("/v1/operators/") && method === "POST") return null; // authentication is not an application save
    return null; // health checks and unknown endpoints are not data changes
  }
  if (!url.hostname.endsWith(".supabase.co") && !url.hostname.endsWith(".supabase.in")) return null;
  if (url.pathname.startsWith("/rest/v1/rpc/")) return null; // an RPC may read or write: unknown
  if (url.pathname.startsWith("/rest/v1/")) {
    if (readMethod) return { origin: "online", operation: "read" };
    if (writeMethod) return { origin: "online", operation: "write" };
  }
  if (url.pathname.startsWith("/storage/v1/")) {
    // Storage LIST/INFO/SIGN uses POST but does not write a file.
    if (/^\/storage\/v1\/(?:object\/(?:list|info|sign)(?:\/|$)|bucket\/list(?:\/|$))/.test(url.pathname)) {
      return { origin: "online", operation: "read" };
    }
    if (readMethod) return { origin: "online", operation: "read" };
    if (writeMethod) return { origin: "online", operation: "write" };
  }
  // Auth, Realtime, and unknown Edge Function POSTs should not be called data saves.
  return null;
}
export type NativeDataEvent = {
  id: string | number;
  phase: "start" | "end";
  operation: DataOperation;
  ok?: boolean;
};
export function recordLocalDataEvent(event: NativeDataEvent) {
  if (!event || (event.operation !== "read" && event.operation !== "write") ||
      (event.phase !== "start" && event.phase !== "end")) return;
  const id = String(event.id);
  if (event.phase === "start") {
    if (nativeOperations.has(id)) return;
    nativeOperations.set(id, beginDataActivity("local", event.operation));
  } else {
    const tracker = nativeOperations.get(id);
    nativeOperations.delete(id);
    if (tracker !== undefined) finishDataActivity(tracker, event.ok === true);
  }
}
export function initActivityMonitor() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  window.addEventListener("nexo-notify", (e: Event) => {
    const detail = (e as CustomEvent<{ text?: string; variant?: NotifyVariant }>).detail;
    if (detail?.text) showStatusNotice(detail.text, detail.variant);
  });
  window.houseMixDesktop?.onLocalActivity?.(recordLocalDataEvent);
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const classification = classifyDataRequest(input, init, Boolean(window.houseMixDesktop));
    if (!classification) return originalFetch(input, init);
    const id = beginDataActivity(classification.origin, classification.operation);
    let promise: Promise<Response>;
    try { promise = originalFetch(input, init); }
    catch (error) { finishDataActivity(id, false); throw error; }
    return promise.then(response => {
      finishDataActivity(id, response.ok);
      return response;
    }, error => {
      finishDataActivity(id, false);
      throw error;
    });
  };
}
