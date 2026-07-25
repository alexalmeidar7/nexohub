import { supabase } from "@/integrations/supabase/client";

type CacheEntry = { list: string[]; ts: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 30_000;

/**
 * Palavras/termos de exceção de música cadastrados pelo dono da rádio
 * (campo `user_settings.infomusic_excecoes`, CSV). Cache curto para
 * evitar rajadas de requisições em listas que renderizam por linha.
 */
export async function getMusicExceptions(userId: string | null | undefined): Promise<string[]> {
  if (!userId) return [];
  const hit = cache.get(userId);
  const now = Date.now();
  if (hit && now - hit.ts < TTL_MS) return hit.list;
  try {
    const { data } = await supabase
      .from("user_settings")
      .select("infomusic_excecoes")
      .eq("user_id", userId)
      .maybeSingle();
    const raw = (data?.infomusic_excecoes || "") as string;
    const list = raw.split(",").map((s) => s.trim()).filter(Boolean);
    cache.set(userId, { list, ts: now });
    return list;
  } catch {
    return hit?.list || [];
  }
}

export function matchesMusicException(
  exceptions: string[],
  artista?: string | null,
  musica?: string | null,
): boolean {
  if (!exceptions || exceptions.length === 0) return false;
  const a = (artista || "").toLowerCase();
  const m = (musica || "").toLowerCase();
  if (!a && !m) return false;
  return exceptions.some((w) => {
    const ww = w.trim().toLowerCase();
    if (!ww) return false;
    return (a && a.includes(ww)) || (m && m.includes(ww));
  });
}

export function filterOutMusicExceptions<T extends { artista?: string | null; musica?: string | null }>(
  exceptions: string[],
  rows: T[],
): T[] {
  if (!exceptions || exceptions.length === 0) return rows;
  return rows.filter((r) => !matchesMusicException(exceptions, r.artista, r.musica));
}

export function invalidateMusicExceptionsCache(userId?: string | null) {
  if (userId) cache.delete(userId);
  else cache.clear();
}
