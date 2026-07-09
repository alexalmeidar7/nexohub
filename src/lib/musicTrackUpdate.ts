/**
 * Guarded track-change updater used by the music sync layer.
 *
 * Semantics:
 *  1. Immediately merges the new track fields (title/artist/cover) and clears
 *     `music_current_curiosity` so downstream consumers (XML feed, telemetry
 *     card) never observe the previous curiosity paired with the new track.
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

export async function applyTrackChangeWithCuriosityGuard(opts: ApplyTrackChangeOptions): Promise<void> {
  const { userId, now, data, merge, fetchCuriosity, isStillCurrent, onError } = opts;

  // Step 1: immediate merge — clears old curiosity, publishes new track.
  const basePatch = {
    music_start_time: now,
    music_current_title: data.titulo,
    music_current_artist: data.artista,
    music_current_cover: data.capa || "",
    music_current_curiosity: "",
  };
  await merge(userId, basePatch);

  // Step 2: background curiosity fetch, guarded on write.
  try {
    const curData = await fetchCuriosity();
    if (curData?.curiosidade && isStillCurrent()) {
      await merge(userId, { music_current_curiosity: curData.curiosidade });
    }
  } catch (e) {
    onError?.(e);
  }
}
