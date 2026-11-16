const PLAYER_SESSION_USER_KEY = "nexohub_player_session_user";

export function getPlayerSessionUserId() {
  if (typeof window === "undefined") return null;
  try { return window.sessionStorage.getItem(PLAYER_SESSION_USER_KEY); } catch { return null; }
}

export function markPlayerSession(userId: string) {
  if (typeof window === "undefined" || !userId) return;
  try { window.sessionStorage.setItem(PLAYER_SESSION_USER_KEY, userId); } catch {}
}

export function clearPlayerSession() {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.removeItem(PLAYER_SESSION_USER_KEY); } catch {}
}
