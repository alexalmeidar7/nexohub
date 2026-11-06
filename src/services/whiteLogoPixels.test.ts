import { describe, expect, it } from "vitest";
import { preserveWhiteLogoDetails } from "./whiteLogoPixels";

describe("preserveWhiteLogoDetails", () => {
  it("preserves contrasting dark lettering as transparent cutouts", () => {
    const pixels = new Uint8ClampedArray([
      240, 190, 20, 255,
      220, 30, 30, 255,
      255, 255, 255, 255,
      0, 0, 0, 0,
    ]);
    preserveWhiteLogoDetails(pixels);
    expect([...pixels]).toEqual([
      255, 255, 255, 255,
      255, 255, 255, 0,
      255, 255, 255, 255,
      255, 255, 255, 0,
    ]);
  });

  it("retains the alpha of a uniform coloured logo", () => {
    const pixels = new Uint8ClampedArray([200, 30, 30, 255, 200, 30, 30, 128, 0, 0, 0, 0]);
    preserveWhiteLogoDetails(pixels);
    expect([...pixels]).toEqual([255, 255, 255, 255, 255, 255, 255, 128, 255, 255, 255, 0]);
  });
});
