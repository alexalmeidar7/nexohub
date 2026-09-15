import { supabase } from "@/integrations/supabase/client";

/**
 * Cache de imagens de artistas do Deezer (via edge function `fetch-artist-image`).
 *
 * Camadas:
 *  1) Memória do módulo (síncrono, zero latência entre componentes).
 *  2) localStorage com TTL de 7 dias (persiste entre sessões).
 *  3) Deduplicação de requisições em voo (mesma chave = 1 request só).
 *
 * Chave = artist.toLowerCase().trim() (+ skip quando > 0).
 */

const LS_PREFIX = "nexo:artistImg:v1:";
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const NEG_TTL_MS = 6 * 60 * 60 * 1000; // cache "não achou" por 6h para não martelar
const LS_MAX = 100;

type Entry = { url: string | null; ts: number };

const mem = new Map<string, Entry>();
const inflight = new Map<string, Promise<string | null>>();

const norm = (a: string, skip = 0) => `${a.trim().toLowerCase()}${skip ? `::${skip}` : ""}`;

function lsGet(key: string): Entry | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LS_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry;
    if (!parsed || typeof parsed.ts !== "number") return null;
    return parsed;
  } catch { return null; }
}

function lsSet(key: string, entry: Entry) {
  if (typeof window === "undefined") return;
  try {
    const keys = Object.keys(window.localStorage).filter(k => k.startsWith(LS_PREFIX));
    if (keys.length >= LS_MAX) {
      keys.slice(0, Math.floor(LS_MAX * 0.4)).forEach(k => {
        try { window.localStorage.removeItem(k); } catch {}
      });
    }
    window.localStorage.setItem(LS_PREFIX + key, JSON.stringify(entry));
  } catch {
    try {
      const keys = Object.keys(window.localStorage).filter(k => k.startsWith(LS_PREFIX));
      keys.slice(0, 50).forEach(k => window.localStorage.removeItem(k));
    } catch {}
  }
}

function isFresh(entry: Entry): boolean {
  const ttl = entry.url ? TTL_MS : NEG_TTL_MS;
  return Date.now() - entry.ts < ttl;
}

export function getArtistImageSync(artist: string, skip = 0): string | null {
  if (!artist) return null;
  const key = norm(artist, skip);
  const memHit = mem.get(key);
  if (memHit && isFresh(memHit)) return memHit.url;
  const lsHit = lsGet(key);
  if (lsHit && isFresh(lsHit)) {
    mem.set(key, lsHit);
    return lsHit.url;
  }
  return null;
}

export async function fetchArtistImageCached(artist: string, skip = 0): Promise<string | null> {
  if (!artist) return null;
  const key = norm(artist, skip);

  const cached = getArtistImageSync(artist, skip);
  if (cached !== null) return cached;
  // Se temos entrada em cache (mesmo negativa) ainda fresca, o sync já retornou.
  const memHit = mem.get(key);
  if (memHit && isFresh(memHit)) return memHit.url;

  const flying = inflight.get(key);
  if (flying) return flying;

  const p = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke("fetch-artist-image", {
        body: skip ? { artist, skip } : { artist },
      });
      const url = !error && data?.ok && typeof data?.url === "string" ? data.url : null;
      const entry: Entry = { url, ts: Date.now() };
      mem.set(key, entry);
      lsSet(key, entry);
      return url;
    } catch {
      const entry: Entry = { url: null, ts: Date.now() };
      mem.set(key, entry);
      lsSet(key, entry);
      return null;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, p);
  return p;
}
