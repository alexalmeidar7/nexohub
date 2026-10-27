import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isSafeImageUrl,
  resolveProgramBadge,
} from "./programImageResolver";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("program image paths in Electron", () => {
  it("resolves bundled Positiva artwork relative to the packaged renderer", () => {
    vi.stubGlobal("window", { location: { protocol: "file:" } });

    const image = resolveProgramBadge({ nome: "Primeira Hora Positiva" });

    expect(image.startsWith("file:")).toBe(true);
    expect(image.endsWith("/programas/primeira-hora.png")).toBe(true);
    expect(isSafeImageUrl(image)).toBe(true);
  });

  it("maps Modão Sertanejo to the existing local artwork", () => {
    vi.stubGlobal("window", { location: { protocol: "file:" } });

    const image = resolveProgramBadge({ nome: "Modão Sertanejo" });

    expect(image.endsWith("/selos/modao.png")).toBe(true);
  });

  it("keeps root-relative paths unchanged in the web app", () => {
    vi.stubGlobal("window", { location: { protocol: "https:" } });

    expect(resolveProgramBadge({ nome: "Primeira Hora Positiva" })).toBe("/selos/primeira-hora.png");
  });
});
