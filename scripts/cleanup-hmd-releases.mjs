import path from "node:path";
import { fileURLToPath } from "node:url";

const TAG_RE = /^v(\d+)\.(\d+)\.(\d+)$/;
const KEEP_VERSIONS = 3;

function versionParts(tag) {
  const match = TAG_RE.exec(tag);
  return match ? match.slice(1).map(Number) : null;
}

function isDesktopRelease(release) {
  if (!release || typeof release !== "object" || release.draft || release.prerelease ||
      typeof release.tag_name !== "string" || !versionParts(release.tag_name) ||
      typeof release.published_at !== "string" || !Array.isArray(release.assets)) return false;
  const version = release.tag_name.slice(1);
  return release.assets.some(asset =>
    asset?.name === `House-Mix-Desktop-${version}-Setup.exe` &&
    typeof asset.size === "number" && asset.size > 0);
}

/** Only the HMD installers are eligible; never touch Nexo Bridge/TV releases. */
export function planDesktopReleaseRetention(allReleases, publishedTag) {
  if (!TAG_RE.test(publishedTag) || !Array.isArray(allReleases)) throw new Error("invalid_published_tag");
  const versions = allReleases.filter(isDesktopRelease).sort((left, right) => {
    const a = versionParts(left.tag_name), b = versionParts(right.tag_name);
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return b[i] - a[i];
    return 0;
  });
  if (versions[0]?.tag_name !== publishedTag) {
    throw new Error("published_release_is_not_latest_hmd");
  }
  const latest = versions[0];
  const version = publishedTag.slice(1);
  if (!latest.assets.some(asset => asset.name === `House-Mix-Desktop-${version}-Setup.exe.blockmap`) ||
      !latest.assets.some(asset => asset.name === "latest.yml")) {
    throw new Error("incomplete_latest_release_do_not_delete_backups");
  }
  return {
    keep: versions.slice(0, KEEP_VERSIONS).map(item => item.tag_name),
    remove: versions.slice(KEEP_VERSIONS).map(item => ({ id: item.id, tag: item.tag_name })),
  };
}

function repoApi(root, token, fetchImpl = fetch) {
  return async (resource, method = "GET") => {
    const response = await fetchImpl(root + resource, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "housemix-hmd-release-retention",
      },
    });
    if (method === "DELETE" && response.status === 404) return null;
    if (!response.ok) throw new Error(`GitHub API ${method} ${resource}: HTTP ${response.status}`);
    return response.status === 204 ? null : response.json();
  };
}

export async function runDesktopReleaseCleanup({
  repo, token, publishedTag, apply = false, fetchImpl = fetch, output = console,
}) {
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo || "")) throw new Error("invalid_repository");
  if (!token) throw new Error("missing_GITHUB_TOKEN");
  const api = repoApi(`https://api.github.com/repos/${repo}`, token, fetchImpl);
  const current = await api("/releases/latest");
  if (current?.tag_name !== publishedTag) throw new Error("latest_release_mismatch_no_cleanup");
  const releases = [];
  for (let page = 1; page <= 20; page++) {
    const batch = await api(`/releases?per_page=100&page=${page}`);
    if (!Array.isArray(batch)) throw new Error("invalid_release_page");
    releases.push(...batch);
    if (batch.length < 100) break;
    if (page === 20) throw new Error("pagination_limit_exceeded_no_cleanup");
  }
  const plan = planDesktopReleaseRetention(releases, publishedTag);
  output.log(`HMD mantidas: ${plan.keep.join(", ")}; antigas: ${plan.remove.length}`);
  if (!apply) return plan;
  for (const old of plan.remove) {
    if (!Number.isSafeInteger(old.id) || old.id <= 0 || !TAG_RE.test(old.tag)) {
      throw new Error("invalid_release_record_no_cleanup");
    }
    // Deleting the release removes its installer, blockmap and manifest;
    // deleting the matching tag keeps GitHub release history tidy as requested.
    await api(`/releases/${old.id}`, "DELETE");
    await api(`/git/refs/tags/${old.tag}`, "DELETE");
    output.log(`HMD antiga excluída: ${old.tag}`);
  }
  return plan;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const pos = args.indexOf("--published");
  const publishedTag = pos >= 0 ? args[pos + 1] : null;
  await runDesktopReleaseCleanup({
    repo: process.env.GITHUB_REPOSITORY,
    token: process.env.GH_TOKEN || process.env.GITHUB_TOKEN,
    publishedTag,
    apply: args.includes("--apply"),
  }).catch(error => {
    console.error("Retenção HMD interrompida:", error.message);
    process.exitCode = 1;
  });
}
