// Single source of truth for the current layout version.
// Bump this string whenever you ship a layout/theme change that must
// invalidate previously cached layout data on every client.
export const LAYOUT_VERSION = "2026-07-22-broadcast-bento-v1";
export const LAYOUT_VERSION_KEY = "__layout_version__";

const STALE_KEY_MATCHERS = [
  (k: string) => k.startsWith("layout_"),
  (k: string) => k.startsWith("layout-"),
  (k: string) => k.startsWith("dashboard_"),
  (k: string) => k.startsWith("dashboard-"),
  (k: string) => k.includes("layout_colors"),
  (k: string) => k.includes("theme_cache"),
  (k: string) => k.startsWith("player_layout"),
  (k: string) => k.startsWith("player-layout"),
];

export function findStaleLayoutKeys(): string[] {
  const stale: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k) continue;
      if (STALE_KEY_MATCHERS.some((m) => m(k))) stale.push(k);
    }
  } catch {
    /* storage unavailable */
  }
  return stale;
}

export function purgeStaleLayoutKeys(): number {
  const keys = findStaleLayoutKeys();
  keys.forEach((k) => {
    try {
      localStorage.removeItem(k);
    } catch {}
  });
  return keys.length;
}

export function getStoredLayoutVersion(): string | null {
  try {
    return localStorage.getItem(LAYOUT_VERSION_KEY);
  } catch {
    return null;
  }
}
