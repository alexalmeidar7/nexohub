import { describe, it, expect, vi } from "vitest";
import { applyLocalPromotionBanner, cachePromotionBanners, rotateDesktopBanner, saveDesktopXml } from "./desktopPromotionBanners";

const owner = "station-owner";
const date = Date.parse("2026-11-16T15:00:00Z");
const promos = (count: number) => Array.from({ length: count }, (_, i) => ({
  id: `promo-${i}`, user_id: owner, nome: `Promotion ${i}`,
  imagem_url: `https://example.com/banner-${i}.png`,
  banner_l_url: `https://example.com/banner-l-${i}.png`,
  data_inicio: "2026-01-01", data_fim: "2026-12-31",
}));
const fileUrl = (url: string) => `file:///C:/House%20Mix/imagens/banners/${url.split("/").pop()}`;
const bridge = () => ({
  getCachedImageFileUrl: vi.fn(async (_url: string) => null as string | null),
  cacheImageFileUrl: vi.fn(async (url: string) => fileUrl(url) as string | null),
});

describe("desktop promotion banners", () => {
  it("downloads all ten Banner L and normal banners and loops through every local image at five-second boundaries", async () => {
    const desktop = bridge();
    const result = await cachePromotionBanners(promos(10), owner, "all-ten", desktop);
    expect(result).toEqual({ registered: 10, cached: 10, failed: [] });
    expect(desktop.cacheImageFileUrl).toHaveBeenCalledTimes(20);
    const frames = Array.from({ length: 10 }, (_, i) => applyLocalPromotionBanner("<items><banner_l/></items>", "all-ten", date + i * 5000));
    expect(new Set(frames).size).toBe(10);
    expect(frames.every(xml => xml.includes("file:///C:/House%20Mix/imagens/banners/"))).toBe(true);
    expect(applyLocalPromotionBanner("<items><banner_l/></items>", "all-ten", date + 4999)).toBe(frames[0]);
    expect(applyLocalPromotionBanner("<items><banner_l/></items>", "all-ten", date + 50000)).toBe(frames[0]);
  });

  it("skips inaccessible files without empty frames, isolates tenants and excludes expired promotions", async () => {
    const desktop = bridge();
    desktop.cacheImageFileUrl.mockImplementation(async url => url.includes("banner-l-0") ? null : fileUrl(url));
    const rows = promos(4);
    rows[2].user_id = "other-station";
    rows[3].data_fim = "2026-01-01";
    const result = await cachePromotionBanners(rows, owner, "missing", desktop);
    expect(result.failed).toEqual(["Promotion 0"]);
    for (let i = 0; i < 8; i++) {
      expect(applyLocalPromotionBanner("<banner_l></banner_l>", "missing", date + i * 5000)).toContain("banner-l-1.png");
    }
    expect(desktop.cacheImageFileUrl.mock.calls.some(([url]) => url.includes("-2.png"))).toBe(false);
  });

  it("reuses downloaded files instead of fetching successfully cached images again", async () => {
    const desktop = bridge();
    desktop.getCachedImageFileUrl.mockImplementation(async (url: string) => fileUrl(url));
    await cachePromotionBanners(promos(10), owner, "cached", desktop);
    expect(desktop.cacheImageFileUrl).not.toHaveBeenCalled();
  });

  it("serializes live XML writes and local rotation without losing other feed fields", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(date);
    try {
      await cachePromotionBanners(promos(2), owner, "writes", bridge());
      let xml = "<dados><titulo>old</titulo><banner_l/></dados>";
      const desktop = {
        readXml: vi.fn(async () => xml),
        saveXml: vi.fn(async (_slug: string, _file: string, content: string) => { xml = content; return "broadcast.xml"; }),
      };
      await Promise.all([
        saveDesktopXml(desktop, "writes", "broadcast.xml", "<dados><titulo>new</titulo><banner_l>https://cloud/banner.png</banner_l></dados>"),
        rotateDesktopBanner(desktop, "writes", "broadcast.xml"),
      ]);
      expect(xml).toContain("<titulo>new</titulo>");
      expect(xml).toContain("file:///");
      expect(xml).not.toContain("https://cloud");
      const first = xml;
      vi.advanceTimersByTime(5000);
      await rotateDesktopBanner(desktop, "writes", "broadcast.xml");
      expect(xml).not.toBe(first);
      expect(xml).toContain("<titulo>new</titulo>");
    } finally { vi.useRealTimers(); }
  });
});
