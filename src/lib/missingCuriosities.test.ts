import { describe, it, expect, vi } from "vitest";
import {
  computeMissingCuriosities,
  fetchAllInfomusic,
  type InfoMusicInput,
  type PlayedInput,
} from "@/lib/missingCuriosities";

describe("computeMissingCuriosities", () => {
  it("includes infomusic rows with empty curiosidade", () => {
    const infos: InfoMusicInput[] = [
      { artista: "LADY GAGA", musica: "ABRACADABRA", curiosidade: "", created_at: "2026-07-27T10:00:00Z" },
      { artista: "MASKAVO", musica: "UM ANJO NO CÉU", curiosidade: null, created_at: "2026-07-27T09:00:00Z" },
      { artista: "COLDPLAY", musica: "YELLOW", curiosidade: "released in 2000", created_at: "2026-07-27T08:00:00Z" },
    ];
    const out = computeMissingCuriosities(infos, []);
    const keys = out.map(r => `${r.artista}::${r.musica}`);
    expect(keys).toContain("LADY GAGA::ABRACADABRA");
    expect(keys).toContain("MASKAVO::UM ANJO NO CÉU");
    expect(keys).not.toContain("COLDPLAY::YELLOW");
  });

  it("treats whitespace-only curiosidade as missing", () => {
    const infos: InfoMusicInput[] = [
      { artista: "A", musica: "B", curiosidade: "   ", created_at: "2026-01-01T00:00:00Z" },
    ];
    expect(computeMissingCuriosities(infos, [])).toHaveLength(1);
  });

  it("adds played tracks not present in infomusic", () => {
    const played: PlayedInput[] = [
      { artista: "ARIANA GRANDE", musica: "THANK U NEXT", created_at: "2026-07-27T12:00:00Z" },
    ];
    const out = computeMissingCuriosities([], played);
    expect(out).toEqual([
      { artista: "ARIANA GRANDE", musica: "THANK U NEXT", ultima: "2026-07-27T12:00:00Z" },
    ]);
  });

  it("does not add played tracks whose curiosity is already saved in infomusic", () => {
    const infos: InfoMusicInput[] = [
      { artista: "Coldplay", musica: "Yellow", curiosidade: "released in 2000", created_at: "2026-01-01T00:00:00Z" },
    ];
    const played: PlayedInput[] = [
      { artista: "COLDPLAY", musica: "YELLOW", created_at: "2026-07-27T12:00:00Z" },
    ];
    expect(computeMissingCuriosities(infos, played)).toHaveLength(0);
  });

  it("normalizes case + trimming so duplicates collapse", () => {
    const infos: InfoMusicInput[] = [
      { artista: " lady gaga ", musica: "abracadabra", curiosidade: "", created_at: "2026-07-27T10:00:00Z" },
      { artista: "LADY GAGA", musica: "ABRACADABRA", curiosidade: null, created_at: "2026-07-27T09:00:00Z" },
    ];
    expect(computeMissingCuriosities(infos, [])).toHaveLength(1);
  });

  it("dedupes when the same track appears in infomusic AND musicas_tocadas", () => {
    const infos: InfoMusicInput[] = [
      { artista: "SMASH MOUTH", musica: "WALKIN' ON THE SUN", curiosidade: "", created_at: "2026-07-27T10:00:00Z" },
    ];
    const played: PlayedInput[] = [
      { artista: "SMASH MOUTH", musica: "WALKIN' ON THE SUN", created_at: "2026-07-27T11:00:00Z" },
    ];
    expect(computeMissingCuriosities(infos, played)).toHaveLength(1);
  });

  it("skips rows without artist or song", () => {
    const infos: InfoMusicInput[] = [
      { artista: "", musica: "", curiosidade: "", created_at: "2026-01-01T00:00:00Z" },
      { artista: null, musica: null, curiosidade: null, created_at: "2026-01-01T00:00:00Z" },
    ];
    expect(computeMissingCuriosities(infos, [])).toHaveLength(0);
  });

  it("sorts by ultima desc (newest first)", () => {
    const infos: InfoMusicInput[] = [
      { artista: "A", musica: "1", curiosidade: "", created_at: "2026-07-20T00:00:00Z" },
      { artista: "B", musica: "2", curiosidade: "", created_at: "2026-07-27T00:00:00Z" },
      { artista: "C", musica: "3", curiosidade: "", created_at: "2026-07-25T00:00:00Z" },
    ];
    const out = computeMissingCuriosities(infos, []);
    expect(out.map(r => r.artista)).toEqual(["B", "C", "A"]);
  });

  it("regression: LADY GAGA / MASKAVO / ARIANA GRANDE all appear even when infomusic is huge", () => {
    // Simulate a large infomusic dataset where the three tracks reported by the
    // user land in different pages (beyond the first 1000 rows).
    const infos: InfoMusicInput[] = [];
    for (let i = 0; i < 2500; i++) {
      infos.push({ artista: `A${i}`, musica: `M${i}`, curiosidade: "already-saved", created_at: "2026-01-01T00:00:00Z" });
    }
    infos.push({ artista: "LADY GAGA", musica: "ABRACADABRA", curiosidade: "", created_at: "2026-07-27T10:00:00Z" });
    infos.push({ artista: "MASKAVO", musica: "UM ANJO NO CÉU", curiosidade: null, created_at: "2026-07-27T09:00:00Z" });
    infos.push({ artista: "ARIANA GRANDE", musica: "THANK U NEXT", curiosidade: "", created_at: "2026-07-27T08:00:00Z" });

    const out = computeMissingCuriosities(infos, []);
    const keys = out.map(r => `${r.artista}::${r.musica}`);
    expect(keys).toContain("LADY GAGA::ABRACADABRA");
    expect(keys).toContain("MASKAVO::UM ANJO NO CÉU");
    expect(keys).toContain("ARIANA GRANDE::THANK U NEXT");
    expect(out).toHaveLength(3);
  });
});

describe("fetchAllInfomusic", () => {
  it("paginates until an empty page is returned", async () => {
    const total = 2350;
    const dataset: InfoMusicInput[] = Array.from({ length: total }, (_, i) => ({
      artista: `A${i}`,
      musica: `M${i}`,
      curiosidade: i % 2 === 0 ? "" : "saved",
      created_at: `2026-07-27T00:00:${String(i % 60).padStart(2, "0")}Z`,
    }));

    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: dataset.slice(from, to + 1),
      error: null,
    }));

    const all = await fetchAllInfomusic(fetchPage, 1000);

    // With chunk=1000 and 2350 rows: pages [0-999], [1000-1999], [2000-2999]
    // Loop stops on the last page since data.length (350) < chunk.
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(all).toHaveLength(total);
    expect(all[0].artista).toBe("A0");
    expect(all[total - 1].artista).toBe(`A${total - 1}`);
  });

  it("stops on error and returns rows collected so far", async () => {
    const fetchPage = vi
      .fn()
      .mockResolvedValueOnce({ data: [{ artista: "A", musica: "M", curiosidade: "", created_at: "x" }], error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("boom") });
    // Use a small chunk so the first page is "full" and forces a second call.
    const all = await fetchAllInfomusic(fetchPage as never, 1);
    expect(all).toHaveLength(1);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("regression: track that only lives after the first 1000 rows is still fetched", async () => {
    const dataset: InfoMusicInput[] = Array.from({ length: 1200 }, (_, i) => ({
      artista: `A${i}`,
      musica: `M${i}`,
      curiosidade: "saved",
      created_at: "2026-01-01T00:00:00Z",
    }));
    dataset.push({
      artista: "LADY GAGA",
      musica: "ABRACADABRA",
      curiosidade: "",
      created_at: "2026-07-27T10:00:00Z",
    });

    const fetchPage = async (from: number, to: number) => ({
      data: dataset.slice(from, to + 1),
      error: null,
    });

    const all = await fetchAllInfomusic(fetchPage, 1000);
    const missing = computeMissingCuriosities(all, []);
    expect(missing.map(r => r.artista)).toContain("LADY GAGA");
  });
});
