/**
 * Pure helper that computes the "músicas sem curiosidade" list.
 *
 * Sources:
 *  - `infomusicRows`: ALL rows from public.infomusic (paginated by the caller).
 *    Any row here whose `curiosidade` is empty MUST appear as missing, even if
 *    the track was never inserted into `musicas_tocadas`.
 *  - `playedRows`: recent public.musicas_tocadas rows. Tracks played but never
 *    written to `infomusic` also surface as missing.
 *
 * Deduplicated by normalized `artista::musica`. Sorted by `ultima` desc.
 */

export interface InfoMusicInput {
  artista: string | null;
  musica: string | null;
  curiosidade: string | null;
  created_at: string | null;
}

export interface PlayedInput {
  artista: string | null;
  musica: string | null;
  created_at: string | null;
}

export interface MissingRow {
  artista: string;
  musica: string;
  ultima: string;
}

const norm = (s: string | null | undefined) => (s || "").normalize("NFC").trim().toLowerCase();

export function computeMissingCuriosities(
  infomusicRows: InfoMusicInput[],
  playedRows: PlayedInput[],
): MissingRow[] {
  const known = new Set(
    infomusicRows
      .filter((i) => (i.curiosidade || "").trim().length > 0)
      .map((i) => `${norm(i.artista)}::${norm(i.musica)}`),
  );

  const seen = new Set<string>();
  const missing: MissingRow[] = [];

  // 1) infomusic rows with empty curiosidade
  for (const i of infomusicRows) {
    if ((i.curiosidade || "").trim().length > 0) continue;
    const key = `${norm(i.artista)}::${norm(i.musica)}`;
    if (!key || key === "::" || known.has(key) || seen.has(key)) continue;
    seen.add(key);
    missing.push({
      artista: i.artista || "",
      musica: i.musica || "",
      ultima: i.created_at || "",
    });
  }

  // 2) musicas_tocadas rows not covered above and without saved curiosidade
  for (const p of playedRows) {
    const key = `${norm(p.artista)}::${norm(p.musica)}`;
    if (!key || key === "::" || known.has(key) || seen.has(key)) continue;
    seen.add(key);
    missing.push({
      artista: p.artista || "",
      musica: p.musica || "",
      ultima: p.created_at || "",
    });
  }

  missing.sort((a, b) => (b.ultima || "").localeCompare(a.ultima || ""));
  return missing;
}

/**
 * Fetch all rows from `infomusic` in chunks. Extracted so tests can inject a
 * fake supabase-like client and verify pagination.
 */
export async function fetchAllInfomusic(
  fetchPage: (from: number, to: number) => Promise<{ data: InfoMusicInput[] | null; error: unknown }>,
  chunkSize = 1000,
): Promise<InfoMusicInput[]> {
  const all: InfoMusicInput[] = [];
  for (let from = 0; ; from += chunkSize) {
    const { data, error } = await fetchPage(from, from + chunkSize - 1);
    if (error || !data || data.length === 0) break;
    all.push(...data);
    if (data.length < chunkSize) break;
  }
  return all;
}
