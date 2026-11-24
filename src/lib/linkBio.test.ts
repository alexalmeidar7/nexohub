import { describe, expect, it } from "vitest";
import { isLinkBioSlug, normalizeLinkBioUrl, resolveLinkBioOnAir, shortLinkBioUrl } from "./linkBio";
describe("Link Bio", () => {
  it("uses a short stable, station-specific path", () => {
    expect(shortLinkBioUrl("positivafm")).toBe("https://housemix.nexobrasil.net/b/positivafm");
    expect(isLinkBioSlug("positivafm")).toBe(true);
    expect(isLinkBioSlug("not/allowed")).toBe(false);
  });
  it("accepts only real web links", () => {
    expect(normalizeLinkBioUrl("javascript:alert(1)")).toBe("");
    expect(normalizeLinkBioUrl("https://apps.apple.com/br/app/exemplo/id123")).toContain("apps.apple.com");
  });
  it("reads live program and presenter photo from public backend, not manually entered text", () => {
    const result = resolveLinkBioOnAir({
      currentProgram: { nome: "Vale Night", horario_inicio: "19:00:00", horario_fim: "00:00:00" },
      currentPresenter: { nome: "Reginaldo", foto: "https://example.com/photo.png" },
    });
    expect(result).toEqual({
      programName: "Vale Night", presenterName: "Reginaldo", presenterPhoto: "https://example.com/photo.png",
      start: "19:00", end: "00:00",
      presenters: [{ id: "primary", name: "Reginaldo", photo: "https://example.com/photo.png" }],
      isLive: true,
      schedule: [],
    });
  });
});
