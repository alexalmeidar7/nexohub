import { supabase } from "@/integrations/supabase/client";

export interface MusicException {
  id: string;
  termo: string;
  capa_url: string | null;
  artista_url: string | null;
  background_url: string | null;
}

type CacheEntry = { list: MusicException[]; ts: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 30_000;

/**
 * Busca exceções de música (artistas ou títulos) com metadados (capa/fundo).
 */
export async function getMusicExceptions(userId: string | null | undefined): Promise<MusicException[]> {
  if (!userId) return [];
  const hit = cache.get(userId);
  const now = Date.now();
  if (hit && now - hit.ts < TTL_MS) return hit.list;
  
  try {
    const [{ data }, { data: settings }] = await Promise.all([
      supabase.from("infomusic_excecoes").select("*").eq("user_id", userId),
      supabase
        .from("user_settings")
        .select("infomusic_excecoes_capa_url, infomusic_excecoes_artista_url")
        .eq("user_id", userId)
        .maybeSingle(),
    ]);

    // Imagens gerais da lista de exceções (valem para todos os termos sem imagem própria)
    const defaultCapa = (settings as any)?.infomusic_excecoes_capa_url || null;
    const defaultArtista = (settings as any)?.infomusic_excecoes_artista_url || null;

    const list: MusicException[] = (data || []).map((d: any) => ({
      id: d.id,
      termo: d.termo,
      capa_url: d.capa_url || defaultCapa,
      artista_url: d.artista_url || defaultArtista,
      background_url: d.background_url || defaultArtista
    }));


    cache.set(userId, { list, ts: now });
    return list;
  } catch {
    return hit?.list || [];
  }
}


export function matchesMusicException(
  exceptions: (string | MusicException)[],
  artista?: string | null,
  musica?: string | null,
): MusicException | null {
  if (!exceptions || exceptions.length === 0) return null;
  const a = (artista || "").toLowerCase();
  const m = (musica || "").toLowerCase();
  if (!a && !m) return null;

  for (const ex of exceptions) {
    const term = typeof ex === "string" ? ex : ex.termo;
    const ww = term.trim().toLowerCase();
    if (!ww) continue;
    if ((a && a.includes(ww)) || (m && m.includes(ww))) {
      return typeof ex === "string" ? { id: "", termo: ex, capa_url: null, artista_url: null, background_url: null } : ex;
    }
  }
  return null;
}

export function filterOutMusicExceptions<T extends { artista?: string | null; musica?: string | null }>(
  exceptions: (string | MusicException)[],
  rows: T[],
): T[] {
  if (!exceptions || exceptions.length === 0) return rows;
  return rows.filter((r) => !matchesMusicException(exceptions, r.artista, r.musica));
}

export function invalidateMusicExceptionsCache(userId?: string | null) {
  if (userId) cache.delete(userId);
  else cache.clear();
}
