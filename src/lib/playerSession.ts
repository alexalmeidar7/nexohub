const PLAYER_SESSION_USER_KEY = "nexohub_player_session_user";

function getPlayerSessionStorage() {
  // The WebView has its own Player auth storage and can restore a Supabase
  // session after the process restarts. Browser tabs retain their usual scope.
  return /NexoPlayerTV\//i.test(window.navigator.userAgent) ? window.localStorage : window.sessionStorage;
}

export function getPlayerSessionUserId() {
  if (typeof window === "undefined") return null;
  try {
    return getPlayerSessionStorage().getItem(PLAYER_SESSION_USER_KEY) || window.sessionStorage.getItem(PLAYER_SESSION_USER_KEY);
  } catch { return null; }
}

export function markPlayerSession(userId: string) {
  if (typeof window === "undefined" || !userId) return;
  try { getPlayerSessionStorage().setItem(PLAYER_SESSION_USER_KEY, userId); } catch {}
}

export function clearPlayerSession() {
  if (typeof window === "undefined") return;
  try { getPlayerSessionStorage().removeItem(PLAYER_SESSION_USER_KEY); } catch {}
  try { window.sessionStorage.removeItem(PLAYER_SESSION_USER_KEY); } catch {}
}
