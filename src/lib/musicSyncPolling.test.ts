import { afterEach, describe, expect, it, vi } from "vitest";
import { startMusicSyncPolling } from "./musicSyncPolling";

afterEach(() => { vi.useRealTimers(); });

describe("music sync polling", () => {
  it("keeps immediate initial sync and a 15 second connected fallback", async () => {
    vi.useFakeTimers();
    const sync = vi.fn().mockResolvedValue(undefined);
    const polling = startMusicSyncPolling(sync, () => true);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sync).toHaveBeenCalledTimes(2);
    polling.stop();
  });

  it("uses a 20 second fallback without realtime", async () => {
    vi.useFakeTimers();
    const sync = vi.fn().mockResolvedValue(undefined);
    const polling = startMusicSyncPolling(sync, () => false);
    await vi.advanceTimersByTimeAsync(19_999);
    expect(sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(sync).toHaveBeenCalledTimes(2);
    polling.stop();
  });

  it("never overlaps slow reads, including manual refresh", async () => {
    vi.useFakeTimers();
    let resolve: (() => void) | undefined;
    const sync = vi.fn(() => new Promise<void>(done => { resolve = done; }));
    const polling = startMusicSyncPolling(sync, () => true);
    polling.refresh();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(sync).toHaveBeenCalledTimes(1);
    resolve?.();
    await vi.advanceTimersByTimeAsync(15_000);
    expect(sync).toHaveBeenCalledTimes(2);
    polling.stop();
    resolve?.();
  });

  it("backs off failed requests to five minutes and resets after recovery", async () => {
    vi.useFakeTimers();
    const sync = vi.fn().mockRejectedValue(new Error("paused"));
    const polling = startMusicSyncPolling(sync, () => true);
    await vi.advanceTimersByTimeAsync(30_000 + 60_000 + 120_000 + 240_000);
    expect(sync).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(299_999);
    expect(sync).toHaveBeenCalledTimes(5);
    sync.mockResolvedValue(undefined);
    await vi.advanceTimersByTimeAsync(1);
    expect(sync).toHaveBeenCalledTimes(6);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(sync).toHaveBeenCalledTimes(7);
    polling.stop();
  });

  it("stops pending polling even when cleanup happens during a request", async () => {
    vi.useFakeTimers();
    let resolve: (() => void) | undefined;
    const sync = vi.fn(() => new Promise<void>(done => { resolve = done; }));
    const polling = startMusicSyncPolling(sync, () => true);
    polling.stop();
    resolve?.();
    await vi.advanceTimersByTimeAsync(600_000);
    polling.refresh();
    expect(sync).toHaveBeenCalledTimes(1);
  });
});
describe("desktop cloud budget", () => {
  it("HMD uses Realtime and only checks cloud every 3 minutes when connected", async () => {
    vi.useFakeTimers();
    const sync = vi.fn(async () => {});
    const polling = startMusicSyncPolling(sync, () => true, { desktop: true });
    await vi.advanceTimersByTimeAsync(30);
    expect(sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(170_000);
    expect(sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(sync).toHaveBeenCalledTimes(2);
    polling.stop();
  });
});
