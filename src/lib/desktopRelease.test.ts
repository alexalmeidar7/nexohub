import { describe, expect, it } from "vitest";
import { getDesktopReleaseChanges, parseLatestDesktopRelease } from "./desktopRelease";
const payload = {
  tag_name: "v1.0.31",
  draft: false,
  prerelease: false,
  published_at: "2026-11-23T13:34:24Z",
  body: "House Mix Desktop 1.0.31",
  assets: [{
    name: "House-Mix-Desktop-1.0.31-Setup.exe",
    size: 369667545,
    browser_download_url:
      "https://github.com/alexalmeidar7/nexohub/releases/download/v1.0.31/House-Mix-Desktop-1.0.31-Setup.exe",
  }],
};
describe("desktop release metadata", () => {
  it("extracts real published installer, version, date and last changes", () => {
    const release = parseLatestDesktopRelease(payload);
    expect(release).toMatchObject({
      version: "1.0.31",
      publishedAt: "2026-11-23T13:34:24Z",
      sizeBytes: 369667545,
    });
    expect(release?.downloadUrl).toContain("v1.0.31/House-Mix-Desktop-1.0.31-Setup.exe");
    expect(release?.changes).toEqual(expect.arrayContaining([
      expect.stringContaining("00h30"),
      expect.stringContaining("Supabase"),
    ]));
  });
  it("does not show broken or untrusted downloads", () => {
    expect(parseLatestDesktopRelease({ ...payload, tag_name: "v1.0.32" })).toBeNull();
    expect(parseLatestDesktopRelease({ ...payload, assets: [] })).toBeNull();
    expect(parseLatestDesktopRelease({ ...payload, draft: true })).toBeNull();
    expect(parseLatestDesktopRelease({ ...payload, assets: [{ ...payload.assets[0], browser_download_url: "https://malicious.example/installer.exe" }] })).toBeNull();
    expect(parseLatestDesktopRelease(null)).toBeNull();
  });
  it("uses release PR notes for future versions, never HTML", () => {
    const changes = getDesktopReleaseChanges(
      "## What's Changed\n* Melhorias de desempenho by @alex in https://github.com/example/test/pull/3\n* [Correção de XML](https://github.com/example/test/pull/4)\n## New Contributors\n* @user\n",
      "1.0.32",
    );
    expect(changes).toEqual(["Melhorias de desempenho", "Correção de XML"]);
    expect(getDesktopReleaseChanges("House Mix Desktop 1.0.32", "1.0.32")).toEqual([]);
  });
});
