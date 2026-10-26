import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { applyTrackChangeWithCuriosityGuard } from "./musicTrackUpdate";

/**
 * Regression tests for the track-change / curiosity race condition.
 *
 * Invariant: when a new song starts playing, the telemetry state
 * (mergeUserDashboardItems -> dashboard_items -> <curiosidade> in XML)
 * MUST update immediately with the new track fields and an empty
 * curiosity, and a slow curiosity fetch from a previous track must
 * NEVER overwrite the current track's state.
 */
describe("applyTrackChangeWithCuriosityGuard", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });
  const trackA = { titulo: "Song A", artista: "Artist A", capa: "coverA.jpg" };
  const trackB = { titulo: "Song B", artista: "Artist B", capa: "coverB.jpg" };

  it("immediately clears old curiosity and publishes new track before AI resolves", async () => {
    const merge = vi.fn().mockResolvedValue(undefined);
    let resolveCuriosity: ((v: { curiosidade: string }) => void) | undefined;
    const fetchCuriosity = vi.fn(
      () => new Promise<{ curiosidade: string }>((res) => { resolveCuriosity = res; })
    );

    const now = 1000;
    const promise = applyTrackChangeWithCuriosityGuard({
      userId: "u1",
      now,
      data: trackA,
      merge,
      fetchCuriosity,
      isStillCurrent: () => true,
    });

    // Yield microtasks so the initial merge runs.
    await Promise.resolve();

    // The immediate merge MUST have happened with cleared curiosity — before AI resolves.
    expect(merge).toHaveBeenCalledTimes(1);
    expect(merge).toHaveBeenCalledWith("u1", expect.objectContaining({
      music_start_time: now,
      music_current_title: trackA.titulo,
      music_current_artist: trackA.artista,
      music_current_cover: trackA.capa,
      music_current_curiosity: "",
    }));

    // Now resolve the AI response; the follow-up merge must write the curiosity.
    expect(resolveCuriosity).toBeDefined();
    resolveCuriosity?.({ curiosidade: "Fun fact about A" });
    await promise;

    expect(merge).toHaveBeenCalledTimes(2);
    expect(merge).toHaveBeenLastCalledWith("u1", expect.objectContaining({ music_current_curiosity: "Fun fact about A" }));
  });

  it("does NOT overwrite the new track's state with a stale curiosity from a previous track", async () => {
    const merge = vi.fn().mockResolvedValue(undefined);

    // Simulate MUSIC_START_KEY being flipped when track B starts.
    let currentStart = 1000;

    // Slow fetch for track A that resolves AFTER track B has started.
    let resolveA: ((v: { curiosidade: string }) => void) | undefined;
    const fetchA = vi.fn(
      () => new Promise<{ curiosidade: string }>((res) => { resolveA = res; })
    );

    // Fast fetch for track B.
    const fetchB = vi.fn().mockResolvedValue({ curiosidade: "Fact about B" });

    // Start track A (start_time = 1000).
    const runA = applyTrackChangeWithCuriosityGuard({
      userId: "u1",
      now: 1000,
      data: trackA,
      merge,
      fetchCuriosity: fetchA,
      isStillCurrent: () => currentStart === 1000,
    });
    await Promise.resolve(); // initial merge for A

    // Track changes to B (start_time = 2000) — this bumps currentStart.
    currentStart = 2000;
    const runB = applyTrackChangeWithCuriosityGuard({
      userId: "u1",
      now: 2000,
      data: trackB,
      merge,
      fetchCuriosity: fetchB,
      isStillCurrent: () => currentStart === 2000,
    });
    await runB; // B resolves fully

    // Now the delayed A response arrives — MUST be ignored.
    expect(resolveA).toBeDefined();
    resolveA?.({ curiosidade: "Stale fact about A" });
    await runA;

    // Extract only the calls that touched music_current_curiosity as a non-empty write.
    const curiosityWrites = merge.mock.calls
      .map(([, patch]) => patch as Record<string, unknown>)
      .filter((p) => typeof p.music_current_curiosity === "string" && p.music_current_curiosity !== "");

    expect(curiosityWrites).toHaveLength(1);
    expect(curiosityWrites[0]).toEqual(expect.objectContaining({
      music_current_curiosity: "Fact about B",
      music_current_curiosity_track: "artist b|song b",
    }));
    expect(curiosityWrites.some((p) => p.music_current_curiosity === "Stale fact about A")).toBe(false);
  });

  it("skips the follow-up curiosity write when fetch returns empty", async () => {
    const merge = vi.fn().mockResolvedValue(undefined);
    const fetchCuriosity = vi.fn().mockResolvedValue({ curiosidade: "" });

    const pending = applyTrackChangeWithCuriosityGuard({
      userId: "u1",
      now: 1000,
      data: trackA,
      merge,
      fetchCuriosity,
      isStillCurrent: () => true,
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await pending;

    expect(merge).toHaveBeenCalledTimes(1); // only the immediate merge
    expect(fetchCuriosity).toHaveBeenCalledTimes(3);
  });

  it("swallows fetch errors via onError and does not merge a curiosity", async () => {
    const merge = vi.fn().mockResolvedValue(undefined);
    const onError = vi.fn();
    const fetchCuriosity = vi.fn().mockRejectedValue(new Error("network down"));

    const pending = applyTrackChangeWithCuriosityGuard({
      userId: "u1",
      now: 1000,
      data: trackA,
      merge,
      fetchCuriosity,
      isStillCurrent: () => true,
      onError,
    });
    await vi.advanceTimersByTimeAsync(10_000);
    await pending;

    expect(merge).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(3);
  });
});
