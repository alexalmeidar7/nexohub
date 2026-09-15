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

/**
 * Emergency pruning function to free localStorage space when browser quota is reached.
 */
export function pruneLocalStorageEmergency(currentUserId?: string | null): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;

      // 1. Remove artist image cache entries (can be re-fetched)
      if (k.startsWith("nexo:artistImg:")) {
        keysToRemove.push(k);
        continue;
      }

      // 2. Remove other users' music keys
      if (
        (k.startsWith("masterview_music_data::") ||
          k.startsWith("masterview_music_start::") ||
          k.startsWith("bot_xml_last_run::")) &&
        currentUserId &&
        !k.endsWith(`::${currentUserId}`)
      ) {
        keysToRemove.push(k);
        continue;
      }

      // 3. Remove legacy global music keys and old logs
      if (
        k === LEGACY_MUSIC_DATA_KEY ||
        k === LEGACY_MUSIC_START_KEY ||
        k === LEGACY_BOT_XML_LAST_RUN_KEY ||
        k.startsWith("boleto_logs_") ||
        k.startsWith("bot_xml_") ||
        k.startsWith("_temp_")
      ) {
        keysToRemove.push(k);
        continue;
      }

      // 4. Remove any heavy cache entries (> 100KB with data URI)
      try {
        const val = localStorage.getItem(k);
        if (val && val.length > 100000 && val.includes("data:image/")) {
          keysToRemove.push(k);
        }
      } catch {}
    }

    keysToRemove.forEach((k) => {
      try { localStorage.removeItem(k); } catch {}
    });
  } catch {}
}

export function writeMusicData(userId: string | null | undefined, data: unknown): void {
  const key = musicDataKey(userId);
  if (!key) return;

  // Sanitize data: don't store oversized base64 images in localStorage
  let safeData: any = data;
  if (data && typeof data === "object" && "capa" in (data as any)) {
    const rawCapa = (data as any).capa;
    if (typeof rawCapa === "string" && rawCapa.startsWith("data:") && rawCapa.length > 50000) {
      safeData = { ...(data as any), capa: "" };
    }
  }

  try {
    localStorage.setItem(key, JSON.stringify(safeData));
  } catch (err) {
    console.warn("localStorage quota exceeded in writeMusicData, attempting cleanup...", err);
    try {
      pruneLocalStorageEmergency(userId);
      // If still failing, strip capa completely
      if (safeData && typeof safeData === "object" && "capa" in safeData) {
        safeData = { ...safeData, capa: "" };
      }
      localStorage.setItem(key, JSON.stringify(safeData));
    } catch (finalErr) {
      console.warn("Could not save music data to localStorage even after pruning:", finalErr);
    }
  }

  // Notify same-tab listeners (storage event only fires cross-tab)
  try {
    window.dispatchEvent(new CustomEvent(MUSIC_DATA_EVENT, { detail: { userId, data } }));
  } catch {}
}

export function writeMusicStart(userId: string | null | undefined, ts: number): void {
  const key = musicStartKey(userId);
  if (!key) return;
  try {
    localStorage.setItem(key, String(ts));
  } catch (err) {
    console.warn("Could not write music start to localStorage:", err);
  }
}

export function writeBotXmlLastRun(userId: string | null | undefined, ts: number): void {
  const key = botXmlLastRunKey(userId);
  if (!key) return;
  try {
    localStorage.setItem(key, String(ts));
  } catch (err) {
    console.warn("Could not write bot XML last run to localStorage:", err);
  }
}

export function clearMusicData(userId: string | null | undefined): void {
  const dk = musicDataKey(userId);
  const sk = musicStartKey(userId);
  if (dk) try { localStorage.removeItem(dk); } catch {}
  if (sk) try { localStorage.removeItem(sk); } catch {}
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

  // Proactively prune stale caches on session startup
  pruneLocalStorageEmergency(userId);

  if (!userId) return;

  try {
    const previous = localStorage.getItem(ACTIVE_USER_KEY);
    if (previous === userId) return;

    // User changed — clear per-user keys belonging to other users to be safe.
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
    toRemove.forEach((k) => {
      try { localStorage.removeItem(k); } catch {}
    });

    localStorage.setItem(ACTIVE_USER_KEY, userId);
  } catch {}
}

/**
 * Parses XML/text schedule string (e.g. "HH:MM:SS", "HH:MM", "YYYY-MM-DD HH:MM:SS")
 * into a unix epoch timestamp in milliseconds.
 */
export function parseHorarioToTimestamp(horarioStr?: string | null): number | null {
  if (!horarioStr) return null;
  const str = horarioStr.trim();
  if (str.includes("-") || str.includes("/")) {
    const parsedDate = new Date(str.replace(/\//g, "-"));
    if (!isNaN(parsedDate.getTime())) return parsedDate.getTime();
  }
  const match = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const now = new Date();
  const h = parseInt(match[1], 10);
  const m = parseInt(match[2], 10);
  const s = parseInt(match[3] || "0", 10);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, s);
  const diff = now.getTime() - d.getTime();
  if (diff < -60000) {
    // Horário futuro por mais de 1 min: provavelmente iniciou no dia anterior
    d.setDate(d.getDate() - 1);
  }
  return d.getTime();
}
