// @vitest-environment jsdom
import { describe, expect, it, vi, afterEach } from "vitest";
import { isFmRoteiroStudio, stampRoteiroXml, publishDesktopRoteiro } from "./desktopRoteiroPublish";
afterEach(() => { delete window.houseMixDesktop; vi.restoreAllMocks(); });
describe("publicação local de roteiro", () => {
  it("mantém a estrutura do vMix e inclui conteúdo e versão", () => {
    const xml = stampRoteiroXml("<programaExpress><programa>Jornal</programa></programaExpress>", "2026-11-27T14:00:00Z", "<p>A &amp; B</p>", "11:00");
    expect(xml).toContain("<programa>Jornal</programa>");
    expect(xml).toContain("<atualizado_em>2026-11-27T14:00:00Z</atualizado_em>");
    expect(xml).toContain("<roteiro_texto>A &amp; B</roteiro_texto>");
    expect(xml).toContain("<hora>11:00</hora>");
  });
  it("grava o XML local offline sem consultar a internet", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const fetchMock = vi.spyOn(window, "fetch").mockRejectedValue(new Error("offline"));
    const saveXml = vi.fn().mockResolvedValue("roteiro.xml");
    window.houseMixDesktop = { saveXml, getCachedImageFileUrl: vi.fn(), readXml: vi.fn(), cacheImageFileUrl: vi.fn() } as any;
    await expect(publishDesktopRoteiro("radio-a", "Estúdio FM", "<programaExpress><programa>Jornal</programa></programaExpress>", "2026-11-27T14:00:00Z")).resolves.toBe(true);
    expect(saveXml).toHaveBeenCalledWith("radio-a", "roteiro.xml", expect.stringContaining("<programa>Jornal</programa>"));
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("não envia podcast ao XML FM", () => {
    expect(isFmRoteiroStudio("Estúdio Podcast")).toBe(false);
    expect(isFmRoteiroStudio("Estúdio FM")).toBe(true);
  });
});
