import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isSafeImageUrl,
  resolveProgramBadge,
  resolveProgramCover,
  resolveProgramThumb,
} from "./programImageResolver";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("program image paths in Electron", () => {
  it("resolves bundled Positiva artwork relative to the packaged renderer", () => {
    vi.stubGlobal("window", { location: { protocol: "file:", href: "file:///C:/Program%20Files/House%20Mix/dist/index.html" } });

    const program = { nome: "Primeira Hora Positiva" };
    const image = resolveProgramBadge(program);
    const cover = resolveProgramCover(program);

    expect(image.startsWith("file:")).toBe(true);
    expect(image.endsWith("/selos/primeira-hora.png")).toBe(true);
    expect(cover.startsWith("file:")).toBe(true);
    expect(cover.endsWith("/programas/primeira-hora.png")).toBe(true);
    expect(isSafeImageUrl(image)).toBe(true);
  });

  it("maps Modão Sertanejo to the existing local artwork", () => {
    vi.stubGlobal("window", { location: { protocol: "file:", href: "file:///C:/Program%20Files/House%20Mix/dist/index.html" } });

    const image = resolveProgramBadge({ nome: "Modão Sertanejo" });

    expect(image.endsWith("/selos/modao.png")).toBe(true);
  });

  it("normalizes stored cover and thumbnail paths in Electron", () => {
    vi.stubGlobal("window", { location: { protocol: "file:", href: "file:///C:/Program%20Files/House%20Mix/dist/index.html" } });

    const cover = resolveProgramCover({ nome: "Teste", capa: "/programas/bom-dia.png" });
    const thumb = resolveProgramThumb({ nome: "Teste", thumb: "/programas/flashback.png" });

    expect(cover.startsWith("file:")).toBe(true);
    expect(cover.endsWith("/programas/bom-dia.png")).toBe(true);
    expect(thumb.startsWith("file:")).toBe(true);
    expect(thumb.endsWith("/programas/flashback.png")).toBe(true);
  });

  it("keeps root-relative paths unchanged in the web app", () => {
    vi.stubGlobal("window", { location: { protocol: "https:" } });

    expect(resolveProgramBadge({ nome: "Primeira Hora Positiva" })).toBe("/selos/primeira-hora.png");
  });
});
