import { describe, expect, it } from "vitest";
import { getTvAppLoginPath } from "./playerTvApp";
describe("shared online Player inside Fire TV", () => {
  it("uses the existing web QR login only for the TV app", () => {
    expect(getTvAppLoginPath("positivafm", "Android TV FireTV NexoPlayerTV/1.1.0")).toBe("/positivafm/player/tv");
    expect(getTvAppLoginPath("positivafm", "Mozilla/5.0 Chrome/138")).toBeNull();
    expect(getTvAppLoginPath(undefined, "NexoPlayerTV/1.1.0")).toBeNull();
    expect(getTvAppLoginPath("../home", "NexoPlayerTV/1.1.0")).toBeNull();
  });
});
