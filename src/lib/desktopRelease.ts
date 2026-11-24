export interface DesktopRelease {
  version: string;
  publishedAt: string;
  downloadUrl: string;
  releaseUrl: string;
  sizeBytes: number;
  changes: string[];
  locutorDownloadUrl?: string;
  locutorSizeBytes?: number;
}

export const HMD_LATEST_RELEASE_API =
  "https://api.github.com/repos/alexalmeidar7/nexohub/releases/latest";

const KNOWN_RELEASE_CHANGES: Record<string, string[]> = {
  "1.0.31": [
    "Atualização automática do HMD agendada para 00h30, com download antecipado.",
    "Reconexão da leitura local de XML/TXT após a primeira seleção no Windows.",
    "Restauração do vMix Control no estúdio anterior após atualizar o aplicativo.",
    "Menos leituras e gravações repetidas no Supabase.",
  ],
};

export function getDesktopReleaseChanges(body: unknown, version: string): string[] {
  if (typeof body !== "string" || !body.trim() ||
      body.trim() === `House Mix Desktop ${version}`) {
    return KNOWN_RELEASE_CHANGES[version] || [];
  }

  // GitHub generates short, human-readable release notes from merged PRs.
  // Strip markdown links and attribution without executing remote HTML.
  const result: string[] = [];
  let contributorSection = false;
  for (const original of body.split(/\r?\n/)) {
    const line = original.trim();
    if (/^#{1,4}\s+/.test(line)) {
      contributorSection = /new contributors/i.test(line);
      continue;
    }
    if (contributorSection || !/^[-*]\s+/.test(line)) continue;
    const cleaned = line
      .replace(/^[-*]\s+/, "")
      .replace(/\[([^\]]+)\]\(https?:\/\/[^)]+\)/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\s+by\s+@[\w-]+\s+in\s+https?:\/\/\S+/i, "")
      .replace(/https?:\/\/github\.com\/\S+/g, "")
      .trim();
    if (cleaned && cleaned.length <= 300) result.push(cleaned);
    if (result.length >= 7) break;
  }
  return result.length ? result : (KNOWN_RELEASE_CHANGES[version] || []);
}

export function parseLatestDesktopRelease(value: unknown): DesktopRelease | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const release = value as Record<string, unknown>;
  if (release.draft === true || release.prerelease === true) return null;
  const match = typeof release.tag_name === "string"
    ? /^v(\d+\.\d+\.\d+)$/.exec(release.tag_name)
    : null;
  if (!match) return null;
  const version = match[1];
  const publishedAt = typeof release.published_at === "string" ? release.published_at : "";
  if (!publishedAt || Number.isNaN(Date.parse(publishedAt))) return null;
  const expectedName = `House-Mix-Desktop-${version}-Setup.exe`;
  const expectedUrl =
    `https://github.com/alexalmeidar7/nexohub/releases/download/v${version}/${expectedName}`;
  const asset = Array.isArray(release.assets)
    ? release.assets.find((item: unknown) => {
        const candidate = item as Record<string, unknown> | null;
        return candidate?.name === expectedName &&
          candidate?.browser_download_url === expectedUrl &&
          typeof candidate?.size === "number" && candidate.size > 0;
      }) as Record<string, unknown> | undefined
    : undefined;
  if (!asset) return null;
  const locutorName = `House-Mix-Locutor-${version}-Setup.exe`;
  const locutorUrl = `https://github.com/alexalmeidar7/nexohub/releases/download/v${version}/${locutorName}`;
  const locutor = (release.assets as Record<string, unknown>[]).find(item => item?.name === locutorName && item.browser_download_url === locutorUrl && typeof item.size === "number" && item.size > 0);
  return {
    version,
    publishedAt,
    downloadUrl: expectedUrl,
    releaseUrl: `https://github.com/alexalmeidar7/nexohub/releases/tag/v${version}`,
    sizeBytes: asset.size as number,
    changes: getDesktopReleaseChanges(release.body, version),
    ...(locutor ? { locutorDownloadUrl: locutorUrl, locutorSizeBytes: locutor.size as number } : {}),
  };
}
