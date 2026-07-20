/**
 * Barramento leve para sincronizar o perfil do usuário em toda a UI do player
 * sem precisar recarregar a página. Emite/escuta um CustomEvent global no
 * `window` — qualquer componente pode reagir à troca de perfil ou avatar.
 */

export type ProfileChangedDetail = {
  userId?: string | null;
  radioUserId?: string | null;
  nome?: string | null;
  email?: string | null;
  avatar_url?: string | null;
  /** motivo do disparo — útil para debug e para escolhas seletivas de refetch */
  reason?: "avatar" | "switch" | "edit" | "manual";
};

const EVENT = "nexo:profile:changed";

export function emitProfileChanged(detail: ProfileChangedDetail = {}) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(new CustomEvent<ProfileChangedDetail>(EVENT, { detail }));
  } catch { /* ignore */ }
}

export function onProfileChanged(cb: (detail: ProfileChangedDetail) => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = (e: Event) => {
    const ce = e as CustomEvent<ProfileChangedDetail>;
    cb(ce.detail || {});
  };
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
