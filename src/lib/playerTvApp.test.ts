import { afterEach, describe, expect, it, vi } from "vitest";
import { getTvAppLoginPath, isPlayerTvApp } from "./playerTvApp";

afterEach(() => { vi.restoreAllMocks(); delete document.documentElement.dataset.tvApp; delete document.documentElement.dataset.ottTvPreview; history.replaceState(null, "", "/"); });
describe("shared online Player inside Fire TV", () => {
  it("uses the existing web QR login only for the TV app", () => {
    expect(getTvAppLoginPath("positivafm", "Android TV FireTV NexoPlayerTV/1.1.0")).toBe("/positivafm/player/tv");
    expect(getTvAppLoginPath("positivafm", "Mozilla/5.0 Chrome/138")).toBeNull();
    expect(getTvAppLoginPath(undefined, "NexoPlayerTV/1.1.0")).toBeNull();
    expect(getTvAppLoginPath("../home", "NexoPlayerTV/1.1.0")).toBeNull();
  });
  it("does not replace the ordinary desktop Player", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla Chrome Desktop");
    history.replaceState(null, "", "/positivafm/player");
    expect(isPlayerTvApp()).toBe(false);
  });
  it("keeps the native Fire TV presentation after navigating away from the initial URL", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Android NexoPlayerTV/1.1.0");
    history.replaceState(null, "", "/user/positivafm/nexohub/player/watch?ch=example");
    expect(isPlayerTvApp()).toBe(true);
  });
  it("supports an explicit TV viewport without treating it as authentication", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue("Mozilla Chrome Desktop");
    history.replaceState(null, "", "/positivafm/player?tv=1");
    expect(isPlayerTvApp()).toBe(true);
    expect(getTvAppLoginPath("positivafm")).toBeNull();
    history.replaceState(null, "", "/positivafm/player/tv");
    expect(isPlayerTvApp()).toBe(true);
    history.replaceState(null, "", "/positivafm/player?tv=0");
    expect(isPlayerTvApp()).toBe(false);
  });
});
