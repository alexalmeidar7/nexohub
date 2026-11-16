import { supabase } from "@/integrations/supabase/client";

/**
 * Cache e resolvedor multi-tier de imagens de artistas.
 *
 * Estratégia de resolução:
 *  1) Cache em memória (síncrono, zero latência).
 *  2) localStorage (TTL de 7 dias para imagens válidas).
 *  3) Deezer API (via JSONP no browser para suporte total a CORS, ou fetch direto).
 *  4) Wikipedia / Wikimedia Commons PageImages API (CORS nativo com origin=*).
 *  5) iTunes Search API (CORS nativo).
 *  6) Supabase Edge Function `fetch-artist-image` (como tentativa paralela com timeout).
 */

const LS_PREFIX = "nexo:artistImg:v3:";
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias para imagens encontradas
const NEG_TTL_MS = 5 * 60 * 1000; // 5 minutos para falha (permite retentativas rápidas)
const LS_MAX = 150;

const PLACEHOLDER_HASHES = [
  "d41d8cd98f00b204e9800998ecf8427e",
  "2a7c75fe7e249e43eb37b1e84b8ba8ba",
];

type Entry = { url: string | null; ts: number };

const mem = new Map<string, Entry>();
const inflight = new Map<string, Promise<string | null>>();
const candidatePools = new Map<string, { list: string[]; ts: number }>();

const norm = (a: string, skip = 0) => `${a.trim().toLowerCase()}${skip ? `::${skip}` : ""}`;

/** Promote known Deezer/iTunes thumbnail URL variants before using them as full-screen art. */
export function upgradeArtistImageResolution(url?: string | null): string | null {
  if (!url || typeof url !== "string") return null;
  return url
    .replace(/\/(?:56|250|500|1000)x(?:56|250|500|1000)(?=-)/gi, "/1000x1000")
    .replace(/\/(?:56|250|500|1000)x(?:56|250|500|1000)(?=\.)/gi, "/1000x1000")
    .replace(/\/100x100(bb)?\.jpg(?=\?|$)/i, "/600x600$1.jpg");
}

function isCleanImageUrl(url?: string | null): url is string {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) return false;
  // Exclui placeholders vazios do Deezer (ex: /artist//1000x1000... ou /cover//500x500...)
  if (
    trimmed.includes("/artist//") ||
    trimmed.includes("/cover//") ||
    trimmed.includes("/album//") ||
    trimmed.includes("//1000x1000") ||
    trimmed.includes("//500x500") ||
    trimmed.includes("//250x250")
  ) {
    return false;
  }
  return !PLACEHOLDER_HASHES.some(h => trimmed.includes(h));
}

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

/** 1. Deezer: via JSONP no browser (bypassa restrições de CORS) ou fetch se suportado */
async function fetchDeezerCandidates(artist: string): Promise<string[]> {
  const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

  if (isBrowser) {
    return new Promise((resolve) => {
      const cbName = `__dz_cb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const script = document.createElement("script");
      const timer = setTimeout(() => {
        cleanup();
        resolve([]);
      }, 3500);

      const cleanup = () => {
        clearTimeout(timer);
        try { delete (window as any)[cbName]; } catch {}
        if (script.parentNode) script.parentNode.removeChild(script);
      };

      (window as any)[cbName] = (data: any) => {
        cleanup();
        const results: string[] = [];
        const list = data?.data || [];
        if (Array.isArray(list)) {
          for (const item of list) {
            const img = upgradeArtistImageResolution(item.picture_xl || item.picture_big || item.picture_medium);
            if (isCleanImageUrl(img) && !results.includes(img)) {
              results.push(img);
            }
          }
        }
        resolve(results);
      };

      script.src = `https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}&output=jsonp&callback=${cbName}&limit=5`;
      script.onerror = () => { cleanup(); resolve([]); };
      document.head.appendChild(script);
    });
  }

  // Fallback para ambientes sem DOM (Node / Worker)
  try {
    const res = await fetch(`https://api.deezer.com/search/artist?q=${encodeURIComponent(artist)}&limit=5`);
    if (!res.ok) return [];
    const data = await res.json();
    const results: string[] = [];
    for (const item of (data?.data || [])) {
      const img = upgradeArtistImageResolution(item.picture_xl || item.picture_big || item.picture_medium);
      if (isCleanImageUrl(img) && !results.includes(img)) {
        results.push(img);
      }
    }
    return results;
  } catch {
    return [];
  }
}

/** 2. Wikipedia / Wikimedia Commons: fotos oficiais com origin=* */
async function fetchWikipediaImages(artist: string): Promise<string[]> {
  const images: string[] = [];
  const endpoints = [
    `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(artist)}&prop=pageimages&format=json&pithumbsize=1000&origin=*`,
    `https://pt.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(artist)}&prop=pageimages&format=json&pithumbsize=1000&origin=*`,
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(ep, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) continue;
      const data = await res.json();
      const pages = data?.query?.pages || {};
      for (const k in pages) {
        const thumb = pages[k]?.thumbnail?.source;
        if (isCleanImageUrl(thumb) && !images.includes(thumb)) {
          images.push(thumb);
        }
      }
      if (images.length > 0) break;
    } catch {}
  }

  return images;
}

/** 3. iTunes Search API: capas em alta definição com CORS nativo */
async function fetchItunesImages(artist: string): Promise<string[]> {
  try {
    const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(artist)}&media=music&entity=album&limit=10`, {
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const results: string[] = [];
    for (const r of (data?.results || [])) {
      if (r.artworkUrl100 && typeof r.artworkUrl100 === "string") {
        const hiRes = r.artworkUrl100
          .replace(/100x100bb\.jpg$/, "600x600bb.jpg")
          .replace(/100x100\.jpg$/, "600x600.jpg");
        if (isCleanImageUrl(hiRes) && !results.includes(hiRes)) {
          results.push(hiRes);
        }
      }
    }
    return results;
  } catch {
    return [];
  }
}

/** 4. Supabase Edge Function (com timeout curto para não travar quando offline) */
async function fetchSupabaseEdgeFunction(artist: string, skip = 0): Promise<string | null> {
  try {
    const invokePromise = supabase.functions.invoke("fetch-artist-image", {
      body: skip ? { artist, skip } : { artist },
    });
    const timeoutPromise = new Promise<{ error: Error }>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout")), 2500)
    );

    const { data, error } = await Promise.race([invokePromise, timeoutPromise]) as any;
    if (!error && data?.ok && typeof data?.url === "string" && isCleanImageUrl(data.url)) {
      return data.url;
    }
  } catch {}
  return null;
}

/**
 * Retorna uma lista unificada de imagens candidatas para o artista.
 */
export async function fetchArtistImageCandidates(artist: string): Promise<string[]> {
  const cleanName = artist.trim().replace(/\s+/g, ' ');
  if (!cleanName) return [];
  const poolKey = cleanName.toLowerCase();

  const cachedPool = candidatePools.get(poolKey);
  if (cachedPool && Date.now() - cachedPool.ts < TTL_MS && cachedPool.list.length > 0) {
    return cachedPool.list;
  }

  // Busca em paralelo através de múltiplos provedores
  const [edgeUrl, deezerImgs, wikiImgs, itunesImgs] = await Promise.all([
    fetchSupabaseEdgeFunction(cleanName, 0),
    fetchDeezerCandidates(cleanName),
    fetchWikipediaImages(cleanName),
    fetchItunesImages(cleanName),
  ]);

  const pool: string[] = [];

  // 1. Imagem oficial do Deezer ou da Edge Function
  const highResEdgeUrl = upgradeArtistImageResolution(edgeUrl);
  if (isCleanImageUrl(highResEdgeUrl) && !pool.includes(highResEdgeUrl)) pool.push(highResEdgeUrl);
  if (deezerImgs[0] && !pool.includes(deezerImgs[0])) pool.push(deezerImgs[0]);

  // 2. Foto de retrato verificada da Wikipedia
  if (wikiImgs[0] && !pool.includes(wikiImgs[0])) pool.push(wikiImgs[0]);

  // 3. Demais fotos do Deezer
  for (let i = 1; i < deezerImgs.length; i++) {
    if (!pool.includes(deezerImgs[i])) pool.push(deezerImgs[i]);
  }

  // 4. Capas em alta do iTunes
  for (const it of itunesImgs) {
    if (!pool.includes(it)) pool.push(it);
  }

  if (pool.length > 0) {
    candidatePools.set(poolKey, { list: pool, ts: Date.now() });
  }

  return pool;
}

export async function fetchArtistImageCached(artist: string, skip = 0): Promise<string | null> {
  const cleanName = artist.trim().replace(/\s+/g, ' ');
  if (!cleanName) return null;
  const key = norm(cleanName, skip);

  const cached = getArtistImageSync(cleanName, skip);
  if (cached !== null) return cached;

  // Se já temos a pool carregada para o artista, seleciona o skip correspondente
  const poolKey = cleanName.toLowerCase();
  const existingPool = candidatePools.get(poolKey);
  if (existingPool && existingPool.list.length > 0) {
    const selected = existingPool.list[skip % existingPool.list.length];
    const entry: Entry = { url: selected, ts: Date.now() };
    mem.set(key, entry);
    lsSet(key, entry);
    return selected;
  }

  const flying = inflight.get(key);
  if (flying) return flying;

  const p = (async () => {
    try {
      const pool = await fetchArtistImageCandidates(cleanName);
      if (pool.length > 0) {
        const url = pool[skip % pool.length];
        const entry: Entry = { url, ts: Date.now() };
        mem.set(key, entry);
        lsSet(key, entry);
        return url;
      }

      // Se nenhum provedor encontrou
      const entry: Entry = { url: null, ts: Date.now() };
      mem.set(key, entry);
      lsSet(key, entry);
      return null;
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
