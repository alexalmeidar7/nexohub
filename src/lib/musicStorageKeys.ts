/**
 * Per-user scoped localStorage keys for "música no ar" data.
 *
 * CRITICAL: Music data MUST be isolated per authenticated user. Sharing a
 * single global key (e.g. "masterview_music_data") leaks one tenant's track
 * into another tenant's UI when both log in on the same browser. This module
 * centralises the key naming so every reader/writer agrees on the scoped key.
 *
 * The functions below return null when no userId is available — callers should
 * treat that as "no music data yet" rather than falling back to a global key.
 */

const LEGACY_MUSIC_DATA_KEY = "masterview_music_data";
const LEGACY_MUSIC_START_KEY = "masterview_music_start";
const LEGACY_BOT_XML_LAST_RUN_KEY = "bot_xml_last_run";

const ACTIVE_USER_KEY = "masterview_active_music_user";

export function musicDataKey(userId: string | null | undefined): string | null {
  return userId ? `masterview_music_data::${userId}` : null;
}

export function musicStartKey(userId: string | null | undefined): string | null {
  return userId ? `masterview_music_start::${userId}` : null;
}

export function botXmlLastRunKey(userId: string | null | undefined): string | null {
  return userId ? `bot_xml_last_run::${userId}` : null;
}

/**
 * Read the parsed music data for a given user. Never falls back to a different
 * user's data — returns null when nothing is stored for this user.
 */
export function readMusicData(userId: string | null | undefined): {
  titulo?: string;
  artista?: string;
  capa?: string;
  duracao?: number;
} | null {
  const key = musicDataKey(userId);
  if (!key) return null;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function readMusicStart(userId: string | null | undefined): number {
  const key = musicStartKey(userId);
  if (!key) return 0;
  return parseInt(localStorage.getItem(key) || "0", 10) || 0;
}

export const MUSIC_DATA_EVENT = "masterview:music-data-updated";

export function writeMusicData(userId: string | null | undefined, data: unknown): void {
  const key = musicDataKey(userId);
  if (!key) return;
  localStorage.setItem(key, JSON.stringify(data));
  // Notify same-tab listeners (storage event only fires cross-tab)
  try {
    window.dispatchEvent(new CustomEvent(MUSIC_DATA_EVENT, { detail: { userId, data } }));
  } catch {}
}

export function writeMusicStart(userId: string | null | undefined, ts: number): void {
  const key = musicStartKey(userId);
  if (!key) return;
  localStorage.setItem(key, String(ts));
}

export function clearMusicData(userId: string | null | undefined): void {
  const dk = musicDataKey(userId);
  const sk = musicStartKey(userId);
  if (dk) localStorage.removeItem(dk);
  if (sk) localStorage.removeItem(sk);
}

/**
 * Call once per session when a user is identified. If the active user changed
 * since the last visit, wipe ALL legacy global keys and any stale per-user
 * keys for previous users so nothing from another tenant leaks into this UI.
 */
export function ensureMusicScopeForUser(userId: string | null | undefined): void {
  // Always nuke legacy unscoped keys — they should never be read again.
  try { localStorage.removeItem(LEGACY_MUSIC_DATA_KEY); } catch {}
  try { localStorage.removeItem(LEGACY_MUSIC_START_KEY); } catch {}
  try { localStorage.removeItem(LEGACY_BOT_XML_LAST_RUN_KEY); } catch {}

  if (!userId) return;

  const previous = localStorage.getItem(ACTIVE_USER_KEY);
  if (previous === userId) return;

  // User changed — clear per-user keys belonging to other users to be safe.
  try {
    const toRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (
        (k.startsWith("masterview_music_data::") ||
          k.startsWith("masterview_music_start::") ||
          k.startsWith("bot_xml_last_run::")) &&
        !k.endsWith(`::${userId}`)
      ) {
        toRemove.push(k);
      }
    }
    toRemove.forEach((k) => localStorage.removeItem(k));
  } catch {}

  localStorage.setItem(ACTIVE_USER_KEY, userId);
}
