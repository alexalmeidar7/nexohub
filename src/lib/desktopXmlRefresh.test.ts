import { afterEach, describe, expect, it, vi } from "vitest";
import { createDesktopXmlRefresh } from "./desktopXmlRefresh";
afterEach(() => vi.useRealTimers());
describe("desktop XML refresh", () => {
  it("refreshes on clock even without database events and coalesces bursts", async () => {
    vi.useFakeTimers(); vi.setSystemTime(0); const sync = vi.fn().mockResolvedValue(undefined);
    const refresh = createDesktopXmlRefresh(sync);
    refresh.request(); refresh.request(); refresh.request();
    await vi.advanceTimersByTimeAsync(250); expect(sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60000); expect(sync).toHaveBeenCalledTimes(2);
    refresh.stop(); await vi.advanceTimersByTimeAsync(60000); expect(sync).toHaveBeenCalledTimes(2);
  });
  it("never overlaps slow requests and replays a pending realtime change once", async () => {
    vi.useFakeTimers(); vi.setSystemTime(0); let finish!: () => void;
    const sync = vi.fn().mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; })).mockResolvedValue(undefined);
    const refresh = createDesktopXmlRefresh(sync); refresh.request();
    await vi.advanceTimersByTimeAsync(250);
    refresh.request(); refresh.request(); await vi.advanceTimersByTimeAsync(30000);
    expect(sync).toHaveBeenCalledTimes(1); finish(); await vi.advanceTimersByTimeAsync(250);
    expect(sync).toHaveBeenCalledTimes(2); refresh.stop();
  });
  it("does not restart after teardown during a pending request", async () => {
    vi.useFakeTimers(); vi.setSystemTime(0); let finish!: () => void;
    const sync = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const refresh = createDesktopXmlRefresh(sync); refresh.request(); await vi.advanceTimersByTimeAsync(250);
    refresh.request(); refresh.stop(); finish(); await vi.advanceTimersByTimeAsync(60000);
    expect(sync).toHaveBeenCalledTimes(1);
  });
  it("refreshes at the minute boundary even if the next safety poll is later", async () => {
    vi.useFakeTimers(); vi.setSystemTime(59_000);
    const sync = vi.fn().mockResolvedValue(undefined), refresh = createDesktopXmlRefresh(sync);
    refresh.request(); await vi.advanceTimersByTimeAsync(250); expect(sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(775); expect(sync).toHaveBeenCalledTimes(2);
    refresh.stop();
  });

});
