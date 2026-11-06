import { fetchArtistImageCached } from "@/lib/artistImageCache";

/**
 * Robust, multi-tier music album art resolver with in-memory & localStorage caching.
 * Resolves covers from iTunes and Deezer with intelligent query sanitization
 * for broadcast automation metadata (e.g. cart numbers, "PEDIDOS DE OUVINTE", slashes, etc.).
 */

const COVER_CACHE_KEY_PREFIX = "nexo:musicCover:v2:";
const CACHE_TTL_MS = 14 * 24 * 60 * 60 * 1000; // 14 days
const memCoverCache = new Map<string, { url: string; ts: number }>();
const inflightCovers = new Map<string, Promise<string>>();

/**
 * Cleans track and artist names commonly dirty in radio automation systems
 * (e.g., "AN SET- 08 - LUIS FONSI - DESPACITO", "LADY GAGA/BRUNO MARS", "TITLE (AO VIVO)")
 */
export function cleanTrackSearch(titulo: string, artista: string): {
  cleanTitle: string;
  cleanArtist: string;
  queries: string[];
} {
  let t = (titulo || "").trim();
  let a = (artista || "").trim();

  // 1. Remove automation/cart prefixes like "!SB - ", "AN SET- 08 - ", "CART 01 - ", etc.
  t = t.replace(/^(!sb|an\s*set|set|cart|bloco|trilha|bg|fx|vinheta)\s*[-_0-9]*\s*[-_:]\s*/i, "").trim();

  // 2. If artist is generic (or contains "PEDIDOS DE OUVINTE", "STANDBY", "LOCUCAO", "COMERCIAL")
  // and title has " - ", extract "Artist - Title" from title.
  const isGenericArtist = !a || /standby|pedidos?\s*de\s*ouvinte|locu[cç][aã]o|comercial|intervalo|rede/i.test(a);
  if (isGenericArtist && t.includes(" - ")) {
    const parts = t.split(" - ");
    if (parts.length >= 2) {
      a = parts[0].trim();
      t = parts.slice(1).join(" - ").trim();
    }
  }

  // 3. Remove common live / edit tags that hurt search matching
  const cleanT = t
    .replace(/\s*[\(\[](ao\s*vivo|live|remix|ac[uú]stico|extended|radio\s*edit|vers[aã]o\s*ac[uú]stica|clipe|oficial|video\s*oficial)[\)\]]/gi, "")
    .trim();

  // 4. Clean up collaborative artist slashes/features
  // e.g. "LADY GAGA/BRUNO MARS" -> "LADY GAGA & BRUNO MARS"
  const cleanA = a
    .replace(/\s*[\/\\]\s*/g, " ")
    .replace(/\s+(feat\.?|ft\.?|participa[cç][aã]o|part\.?)\s+.*/i, "")
    .trim();

  const queries: string[] = [];

  // Query 1: Clean artist + clean title
  if (cleanA && cleanT && cleanA.toLowerCase() !== "desconhecido" && cleanT.toLowerCase() !== "sem título") {
    queries.push(`${cleanA} ${cleanT}`.trim());
  }

  // Query 2: Original artist + clean title (if different)
  if (a && cleanT && a !== cleanA && a.toLowerCase() !== "desconhecido") {
    queries.push(`${a} ${cleanT}`.trim());
  }

  // Query 3: Raw title + artist if title already contained both
  if (t.includes(" - ")) {
    queries.push(t.replace(" - ", " ").trim());
  }

  // Query 4: Just title if artist is unknown
  if (cleanT && cleanT.toLowerCase() !== "sem título" && cleanT.length > 3) {
    queries.push(cleanT);
  }

  return {
    cleanTitle: cleanT || t || "Sem título",
    cleanArtist: cleanA || a || "Desconhecido",
    queries: Array.from(new Set(queries.filter(q => q.length > 2))),
  };
}

function getCacheKey(titulo: string, artista: string): string {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  return `${norm(artista)}::${norm(titulo)}`;
}

/** Synchronously check in-memory or localStorage cache */
export function getTrackCoverSync(titulo: string, artista: string): string | null {
  if (!titulo && !artista) return null;
  const key = getCacheKey(titulo, artista);

  // Check memory
  const mem = memCoverCache.get(key);
  if (mem && Date.now() - mem.ts < CACHE_TTL_MS) {
    return mem.url || null;
  }

  // Check localStorage
  try {
    const raw = localStorage.getItem(COVER_CACHE_KEY_PREFIX + key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.url === "string" && Date.now() - parsed.ts < CACHE_TTL_MS) {
        memCoverCache.set(key, parsed);
        return parsed.url || null;
      }
    }
  } catch {}

  return null;
}

function setTrackCoverCache(titulo: string, artista: string, url: string) {
  const key = getCacheKey(titulo, artista);
  const entry = { url, ts: Date.now() };
  memCoverCache.set(key, entry);
  try {
    localStorage.setItem(COVER_CACHE_KEY_PREFIX + key, JSON.stringify(entry));
  } catch {}
}

/**
 * Fetches iTunes album art using multiple query attempts.
 */
async function queryItunes(query: string, timeoutMs = 3500): Promise<string | null> {
  try {
    console.log(`[MusicSync] Querying iTunes for: "${query}"`);
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.log(`[MusicSync] iTunes query timeout for: "${query}"`);
      controller.abort();
    }, timeoutMs);
    const encoded = encodeURIComponent(query);
    const url = `https://itunes.apple.com/search?term=${encoded}&media=music&entity=song&limit=2`;
    console.log(`[MusicSync] iTunes URL: ${url}`);
    const res = await fetch(url, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    console.log(`[MusicSync] iTunes response status: ${res.status} for query: "${query}"`);
    if (!res.ok) {
      console.log(`[MusicSync] iTunes error response: ${res.status} for query: "${query}"`);
      return null;
    }
    const data = await res.json();
    console.log(`[MusicSync] iTunes data for "${query}":`, data?.results?.length || 0, "results");
    if (data?.results && Array.isArray(data.results) && data.results.length > 0) {
      const artwork = data.results[0].artworkUrl100;
      console.log(`[MusicSync] iTunes artwork for "${query}":`, artwork);
      if (artwork && typeof artwork === "string") {
        const result = artwork.replace("100x100", "600x600");
        console.log(`[MusicSync] iTunes cover found for "${query}": ${result}`);
        return result;
      }
    }
    console.log(`[MusicSync] No iTunes artwork found for: "${query}"`);
  } catch (e) {
    console.log(`[MusicSync] iTunes fetch error for "${query}":`, e instanceof Error ? e.message : String(e));
  }
  return null;
}

/**
 * Resolves the cover image for a track:
 * 1) Fast cache check (memory & localStorage)
 * 2) Multi-strategy iTunes Search queries
 * 3) Deezer artist image fallback
 */
export async function fetchTrackCover(titulo: string, artista: string): Promise<string> {
  const t = (titulo || "").trim();
  const a = (artista || "").trim();
  if (!t && !a) return "";

  const cached = getTrackCoverSync(t, a);
  if (cached !== null) return cached;

  const key = getCacheKey(t, a);
  const existingPromise = inflightCovers.get(key);
  if (existingPromise) return existingPromise;

  const fetchPromise = (async () => {
    try {
      const { cleanTitle, cleanArtist, queries } = cleanTrackSearch(t, a);

      // Try iTunes queries in order of precision
      for (const q of queries) {
        const cover = await queryItunes(q);
        if (cover) {
          setTrackCoverCache(t, a, cover);
          setTrackCoverCache(cleanTitle, cleanArtist, cover);
          return cover;
        }
      }

      // Fallback: If no album cover found on iTunes, try artist image via Deezer
      if (cleanArtist && cleanArtist.toLowerCase() !== "desconhecido") {
        const artistImg = await fetchArtistImageCached(cleanArtist);
        if (artistImg) {
          setTrackCoverCache(t, a, artistImg);
          return artistImg;
        }
      }

      // Negative cache for 30 minutes to prevent spamming
      const emptyEntry = { url: "", ts: Date.now() - CACHE_TTL_MS + (30 * 60 * 1000) };
      memCoverCache.set(key, emptyEntry);
      return "";
    } finally {
      inflightCovers.delete(key);
    }
  })();

  inflightCovers.set(key, fetchPromise);
  return fetchPromise;
}
