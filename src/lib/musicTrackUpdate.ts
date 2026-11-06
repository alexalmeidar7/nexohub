/**
 * Guarded track-change updater used by the music sync layer.
 *
 * Semantics:
 *  1. Immediately merges the new track fields (title/artist/cover) and clears
 *     `music_current_curiosity` so downstream consumers (XML feed, telemetry
 *     card) never observe the previous curiosity paired with the new track.
 *     A short-lived `music_current_curiosity_track` signature and
 *     `music_current_curiosity_expires_at` timestamp are also written so the
 *     XML endpoint can self-invalidate curiosity without waiting for the
 *     next client write.
 *  2. Kicks off the curiosity fetch in the background.
 *  3. Only writes the fetched curiosity if `isStillCurrent()` is true — i.e.
 *     the track hasn't changed again while the request was in flight. This
 *     prevents a slow response for song A from overwriting song B's state.
 */
export interface ApplyTrackChangeOptions {
  userId: string;
  now: number;
  data: { titulo: string; artista: string; capa: string };
  merge: (userId: string, patch: Record<string, unknown>) => Promise<unknown>;
  fetchCuriosity: () => Promise<{ curiosidade?: string } | null | undefined>;
  isStillCurrent: () => boolean;
  onError?: (err: unknown) => void;
}

/** Curiosity TTL — how long a fresh curiosity remains valid in the XML. */
export const CURIOSITY_TTL_MS = 20000;

/** Stable signature used to bind curiosity to the exact track it was fetched for. */
export function trackSignature(titulo: string, artista: string): string {
  return `${(artista || "").trim().toLowerCase()}|${(titulo || "").trim().toLowerCase()}`;
}

export async function applyTrackChangeWithCuriosityGuard(opts: ApplyTrackChangeOptions): Promise<void> {
  const { userId, now, data, merge, fetchCuriosity, isStillCurrent, onError } = opts;
  const sig = trackSignature(data.titulo, data.artista);

  // Step 1: immediate merge — clears old curiosity, publishes new track.
  // NOTE: We intentionally omit music_current_cover if it's empty, allowing
  // fetchCoverAndArtistImg (which runs in parallel) to provide cover/artist_img
  // without being clobbered by an empty string from here.
  const basePatch: Record<string, any> = {
    music_start_time: now,
    music_current_title: data.titulo,
    music_current_artist: data.artista,
    music_current_curiosity: "",
    music_current_curiosity_track: sig,
    music_current_curiosity_expires_at: null,
  };
  
  // Only include cover if non-empty (e.g., from XML or cache)
  if (data.capa) {
    basePatch.music_current_cover = data.capa;
  }
  
  await merge(userId, basePatch);

  // Step 2: background curiosity fetch — up to 3 attempts spaced 5s apart at
  // the start of the song, stopping as soon as a curiosity is found.
  const MAX_ATTEMPTS = 3;
  const RETRY_MS = 5000;
  const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (!isStillCurrent()) return;
    try {
      const curData = await fetchCuriosity();
      if (!isStillCurrent()) return;
      if (curData?.curiosidade) {
        const expiresAt = Date.now() + CURIOSITY_TTL_MS;
        await merge(userId, {
          music_current_curiosity: curData.curiosidade,
          music_current_curiosity_track: sig,
          music_current_curiosity_expires_at: new Date(expiresAt).toISOString(),
        });
        // Step 3: curiosity lives in XML for CURIOSITY_TTL_MS only, then clears.
        setTimeout(() => {
          if (isStillCurrent()) {
            void merge(userId, {
              music_current_curiosity: "",
              music_current_curiosity_expires_at: null,
            }).catch((e) => onError?.(e));
          }
        }, CURIOSITY_TTL_MS);
        return;
      }
    } catch (e) {
      onError?.(e);
    }
    if (attempt < MAX_ATTEMPTS) await delay(RETRY_MS);
  }
}
