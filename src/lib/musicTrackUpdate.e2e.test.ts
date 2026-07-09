import { describe, it, expect, vi } from "vitest";
import { applyTrackChangeWithCuriosityGuard } from "./musicTrackUpdate";

/**
 * E2E-style regression: simulate the full pipeline from a rapid track change
 * through to the telemetry state that feeds both the <curiosidade> XML tag
 * and the "Curiosidade da música no ar" card.
 *
 * The "telemetry store" here plays the role of `user_settings.dashboard_items`
 * (which serve-xml-broadcast reads to build <curiosidade>, and which
 * InfoMusicSection reads to render the card). We assert:
 *
 *  1. The moment a new song starts, telemetry immediately reflects the new
 *     track and has an EMPTY curiosity — never the previous song's fact.
 *  2. While the AI curiosity for song A is still in flight, a fast switch
 *     to song B (and even song C) is respected: telemetry never shows A's
 *     fact after B/C started, even when A's response finally arrives.
 *  3. Only the curiosity that matches the currently-playing track is ever
 *     written to telemetry.
 */
describe("music telemetry e2e — rapid track changes", () => {
  it("keeps <curiosidade> and card in sync through rapid A → B → C switches", async () => {
    // Simulated backend: dashboard_items merged snapshot.
    const telemetry: Record<string, unknown> = {};
    const timeline: Array<{ at: number; title: unknown; curiosity: unknown }> = [];
    let clock = 0;
    const snapshot = () =>
      timeline.push({
        at: clock,
        title: telemetry.music_current_title,
        curiosity: telemetry.music_current_curiosity,
      });

    const merge = vi.fn(async (_uid: string, patch: Record<string, unknown>) => {
      Object.assign(telemetry, patch);
      snapshot();
    });

    // Simulated "currently playing" pointer, mirrored from MUSIC_START_KEY.
    let currentStart = 0;

    // Deferred curiosity fetches per track, keyed by start time.
    const pending: Record<number, (v: { curiosidade: string }) => void> = {};
    const makeFetch = (startAt: number) => () =>
      new Promise<{ curiosidade: string }>((resolve) => {
        pending[startAt] = resolve;
      });

    // Song A starts.
    clock = 1000;
    currentStart = 1000;
    const runA = applyTrackChangeWithCuriosityGuard({
      userId: "u1",
      now: 1000,
      data: { titulo: "Song A", artista: "Artist A", capa: "a.jpg" },
      merge,
      fetchCuriosity: makeFetch(1000),
      isStillCurrent: () => currentStart === 1000,
    });
    await Promise.resolve();

    // Immediately after A: telemetry shows A with empty curiosity.
    expect(telemetry.music_current_title).toBe("Song A");
    expect(telemetry.music_current_curiosity).toBe("");

    // User skips fast to B before A's curiosity resolves.
    clock = 1200;
    currentStart = 1200;
    const runB = applyTrackChangeWithCuriosityGuard({
      userId: "u1",
      now: 1200,
      data: { titulo: "Song B", artista: "Artist B", capa: "b.jpg" },
      merge,
      fetchCuriosity: makeFetch(1200),
      isStillCurrent: () => currentStart === 1200,
    });
    await Promise.resolve();

    expect(telemetry.music_current_title).toBe("Song B");
    expect(telemetry.music_current_curiosity).toBe("");

    // Now A's slow response finally arrives — must be ignored.
    clock = 1300;
    pending[1000]({ curiosidade: "Stale A fact" });
    await runA;

    expect(telemetry.music_current_title).toBe("Song B");
    expect(telemetry.music_current_curiosity).toBe("");

    // Skip again to C before B resolves.
    clock = 1400;
    currentStart = 1400;
    const runC = applyTrackChangeWithCuriosityGuard({
      userId: "u1",
      now: 1400,
      data: { titulo: "Song C", artista: "Artist C", capa: "c.jpg" },
      merge,
      fetchCuriosity: makeFetch(1400),
      isStillCurrent: () => currentStart === 1400,
    });
    await Promise.resolve();

    // B's response arrives late — also ignored.
    clock = 1500;
    pending[1200]({ curiosidade: "Stale B fact" });
    await runB;

    expect(telemetry.music_current_title).toBe("Song C");
    expect(telemetry.music_current_curiosity).toBe("");

    // Finally C resolves in time.
    clock = 1600;
    pending[1400]({ curiosidade: "Fresh C fact" });
    await runC;

    expect(telemetry.music_current_title).toBe("Song C");
    expect(telemetry.music_current_curiosity).toBe("Fresh C fact");

    // Invariant across the whole timeline: telemetry.curiosity is NEVER a
    // stale value paired with a newer title.
    for (const frame of timeline) {
      if (frame.title === "Song A") {
        expect(frame.curiosity === "" || frame.curiosity === undefined).toBe(true);
      }
      if (frame.title === "Song B") {
        expect(frame.curiosity === "" || frame.curiosity === undefined).toBe(true);
      }
      if (frame.title === "Song C") {
        expect(frame.curiosity === "" || frame.curiosity === "Fresh C fact").toBe(true);
      }
    }

    // And no stale fact ever reached the store.
    const allCuriosities = timeline.map((f) => f.curiosity);
    expect(allCuriosities).not.toContain("Stale A fact");
    expect(allCuriosities).not.toContain("Stale B fact");
  });
});
