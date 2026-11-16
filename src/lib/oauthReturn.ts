const OAUTH_RETURN_KEY = "nexohub_oauth_return_path";

function sanitizeReturnPath(path: string | null | undefined): string | null {
  const value = (path || "").trim();
  if (!value || !value.startsWith("/") || value.startsWith("//")) return null;
  if (value.startsWith("/~oauth")) return null;
  return value;
}

export function getCurrentReturnPath() {
  if (typeof window === "undefined") return "/";
  return sanitizeReturnPath(`${window.location.pathname}${window.location.search}${window.location.hash}`) || "/";
}

export function setOAuthReturnPath(path: string) {
  if (typeof window === "undefined") return;
  const safe = sanitizeReturnPath(path);
  if (!safe) return;
  try {
    window.localStorage.setItem(OAUTH_RETURN_KEY, safe);
  } catch { /* ignore */ }
}

export function consumeOAuthReturnPath() {
  if (typeof window === "undefined") return null;
  try {
    const safe = sanitizeReturnPath(window.localStorage.getItem(OAUTH_RETURN_KEY));
    window.localStorage.removeItem(OAUTH_RETURN_KEY);
    return safe;
  } catch {
    return null;
  }
}

export function clearOAuthReturnPath() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(OAUTH_RETURN_KEY); } catch { /* ignore */ }
}

export function getManagedOAuthRedirectUri() {
  if (typeof window === "undefined") return undefined;
  // Use apenas o origin: o fluxo managed (web_message/popup) postará os tokens
  // de volta ao opener antes de qualquer navegação. Apontar redirect_uri para
  // uma rota SPA (ex.: /auth/callback) faz o Navigate correr antes do handshake
  // postMessage terminar, resultando em sessão vazia e retorno à tela de login.
  return window.location.origin;
}
