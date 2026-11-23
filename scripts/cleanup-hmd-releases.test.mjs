import test from "node:test";
import assert from "node:assert/strict";
import { planDesktopReleaseRetention, runDesktopReleaseCleanup } from "./cleanup-hmd-releases.mjs";

const make = (version, extras = {}) => ({
  id: Number(version.split(".")[2]) + 100,
  tag_name: `v${version}`,
  published_at: "2026-11-23T13:34:24Z",
  draft: false, prerelease: false,
  assets: [
    { name: `House-Mix-Desktop-${version}-Setup.exe`, size: 369000000 },
    { name: `House-Mix-Desktop-${version}-Setup.exe.blockmap`, size: 380000 },
    { name: "latest.yml", size: 398 },
  ],
  ...extras,
});
const releases = [
  make("1.0.29"), make("1.0.31"), make("1.0.28"),
  make("1.0.30"), make("1.0.27"),
  make("3.0.0", { assets: [{ name: "NexoBridge.exe", size: 9000 }] }),
  make("1.0.99", { draft: true }),
];

test("keeps the current HMD and exactly two previous versions", () => {
  const plan = planDesktopReleaseRetention(releases, "v1.0.31");
  assert.deepEqual(plan.keep, ["v1.0.31", "v1.0.30", "v1.0.29"]);
  assert.deepEqual(plan.remove.map(x => x.tag), ["v1.0.28", "v1.0.27"]);
});
test("refuses cleanup if the last installer/manifest is incomplete or tag mismatches", () => {
  assert.throws(() => planDesktopReleaseRetention(releases, "v1.0.30"), /not_latest/);
  const broken = [make("1.0.31", { assets: [{ name: "House-Mix-Desktop-1.0.31-Setup.exe", size: 23 }] })];
  assert.throws(() => planDesktopReleaseRetention(broken, "v1.0.31"), /incomplete/);
});
test("dry-run never deletes anything, apply only deletes HMD releases and tags", async () => {
  const calls = [];
  const mockFetch = async (url, options) => {
    const resource = new URL(url).pathname;
    calls.push([options.method, resource]);
    if (resource.endsWith("/releases/latest")) return { ok: true, status: 200, json: async () => make("1.0.31") };
    if (resource.endsWith("/releases")) return { ok: true, status: 200, json: async () => releases };
    if (options.method === "DELETE") return { ok: true, status: 204 };
    throw new Error("unexpected URL: " + url);
  };
  const args = { repo: "alexalmeidar7/nexohub", token: "test-token", publishedTag: "v1.0.31",
    fetchImpl: mockFetch, output: { log() {} } };
  await runDesktopReleaseCleanup({ ...args, apply: false });
  assert.equal(calls.filter(([method]) => method === "DELETE").length, 0);
  await runDesktopReleaseCleanup({ ...args, apply: true });
  const deleted = calls.filter(([method]) => method === "DELETE").map(([, resource]) => resource);
  assert.equal(deleted.length, 4);
  assert.ok(deleted.every(x => !x.includes("v1.0.29") && !x.includes("v1.0.30") && !x.includes("v1.0.31")));
  assert.ok(deleted.some(x => x.endsWith("/git/refs/tags/v1.0.27")));
});
