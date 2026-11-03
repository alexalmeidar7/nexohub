// Cross-tab sync for the Site module (admin <-> /site-preview).
// Uses BroadcastChannel (same-origin tabs) and falls back to a no-op.

type SiteSyncEvent =
  | { type: "config" }
  | { type: "noticias" }
  | { type: "categorias" };

const CHANNEL = "nexohub-site-sync";

let bc: BroadcastChannel | null = null;
function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  if (!bc) bc = new BroadcastChannel(CHANNEL);
  return bc;
}

export function postSiteSync(ev: SiteSyncEvent) {
  try {
    getChannel()?.postMessage(ev);
  } catch {}
}

export function subscribeSiteSync(handler: (ev: SiteSyncEvent) => void): () => void {
  const ch = getChannel();
  if (!ch) return () => {};
  const listener = (e: MessageEvent) => {
    if (e.data && typeof e.data === "object" && "type" in e.data) handler(e.data as SiteSyncEvent);
  };
  ch.addEventListener("message", listener);
  return () => ch.removeEventListener("message", listener);
}
