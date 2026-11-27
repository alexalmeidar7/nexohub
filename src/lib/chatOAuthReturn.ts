/** Pending Google login for the phone's station-scoped chat (never the dashboard). */
const KEY = "nexo_player_chat_oauth_return_v1";
const TTL = 20 * 60 * 1000;
const CHAT_ROUTE = /^\/[a-z0-9_-]+\/pair\?mode=chat&radio=[0-9a-f-]{36}(?:&tv=[0-9a-f-]{0,36})?$/i;

export function getChatOAuthReturn(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(KEY);
    if (!value) return null;
    const { path, timestamp } = JSON.parse(value) as { path?: string; timestamp?: number };
    if (typeof path === "string" && CHAT_ROUTE.test(path) &&
        typeof timestamp === "number" && Date.now() - timestamp >= 0 && Date.now() - timestamp < TTL) {
      return path;
    }
    window.localStorage.removeItem(KEY);
  } catch { /* Storage can be blocked in private browsing. */ }
  return null;
}

export function saveChatOAuthReturn(path: string): void {
  if (typeof window === "undefined" || !CHAT_ROUTE.test(path)) return;
  try { window.localStorage.setItem(KEY, JSON.stringify({ path, timestamp: Date.now() })); } catch { /* ignore */ }
}

export function clearChatOAuthReturn(): void {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(KEY); } catch { /* ignore */ }
}
