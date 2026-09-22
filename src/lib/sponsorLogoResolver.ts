/**
 * Canonical Sponsor Logo Resolver for House Mix & Antigravity.
 *
 * GUARANTEE:
 * 1. ZERO fictitious or synthetic mock logos. All logos rendered are authentic
 *    brand assets saved in the database and local asset library.
 * 2. Resolves legacy Supabase storage URLs (zzjfzxxvxbspbdkodoix.supabase.co)
 *    and relative paths to authentic client assets in /storage/comercial/logos/.
 * 3. Falls back strictly to authentic default asset (/default-sponsor-logo.png)
 *    if no authentic logo is registered. NEVER creates synthetic brand badges.
 */

import sponsorAssetsData from "@/data/sponsor_logo_assets.json";

interface SponsorAssetMap {
  nameToFilename: Record<string, string>;
  urlMapping: Record<string, string>;
  updatedAt?: string;
}

const assetMap: SponsorAssetMap = sponsorAssetsData as SponsorAssetMap;

export function sanitizeBrandKey(s?: string | null): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

export function cleanSponsorName(raw?: string | null): string {
  if (!raw) return "PATROCINADOR";
  return raw
    .replace(/\s*-\s*BRANCA$/i, "")
    .replace(/\s*-\s*BRANCO$/i, "")
    .replace(/\s+BRANCA$/i, "")
    .replace(/\s+BRANCO$/i, "")
    .replace(/\s*\+\s*PRA\s*VOCÊ/i, "")
    .trim();
}

/**
 * Checks if a given logo URL is valid and non-synthetic.
 */
export function isSafeSponsorLogoUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  // Disallow old synthetic SVG data URLs
  if (trimmed.startsWith("data:image/svg+xml")) return false;
  if (trimmed.includes("default-sponsor-logo.png")) return false;
  return (
    trimmed.startsWith("data:image/") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://")
  );
}

/**
 * Finds the authentic local asset filename for a given sponsor name.
 */
export function findAuthenticLogoByName(sponsorName?: string | null): string | null {
  if (!sponsorName) return null;
  const clean = cleanSponsorName(sponsorName);
  const cleanKey = sanitizeBrandKey(clean);
  const rawKey = sanitizeBrandKey(sponsorName);

  // 1. Direct key match in nameToFilename
  if (assetMap.nameToFilename[cleanKey]) {
    return `/storage/comercial/logos/${assetMap.nameToFilename[cleanKey]}`;
  }
  if (assetMap.nameToFilename[rawKey]) {
    return `/storage/comercial/logos/${assetMap.nameToFilename[rawKey]}`;
  }

  // 2. Substring match
  for (const [key, filename] of Object.entries(assetMap.nameToFilename)) {
    if (key.length >= 3 && (cleanKey.includes(key) || key.includes(cleanKey))) {
      return `/storage/comercial/logos/${filename}`;
    }
    if (key.length >= 3 && (rawKey.includes(key) || key.includes(rawKey))) {
      return `/storage/comercial/logos/${filename}`;
    }
  }

  return null;
}

/**
 * Canonical resolver for sponsor logos.
 * Resolves URLs from database, XML feeds, or sponsor name to authentic image assets.
 */
export function resolveSponsorLogoUrl(
  logoUrl?: string | null,
  sponsorName?: string | null
): string {
  // 1. Check if logoUrl is a valid data URL (PNG, JPEG, WEBP) - ignoring synthetic SVGs
  if (logoUrl && typeof logoUrl === "string") {
    const trimmed = logoUrl.trim();
    if (trimmed.startsWith("data:image/") && !trimmed.startsWith("data:image/svg+xml")) {
      return trimmed;
    }

    // 2. Check direct URL mappings from sponsor_logo_assets.json
    if (assetMap.urlMapping[trimmed]) {
      return assetMap.urlMapping[trimmed];
    }

    // Check by basename (e.g., 1777039372338-x32hx7r9vx.png)
    const baseName = trimmed.split("/").pop()?.split("?")[0] || "";
    if (baseName && assetMap.urlMapping[baseName]) {
      return assetMap.urlMapping[baseName];
    }

    // 3. If URL is a Supabase storage path or dead domain, rewrite to local storage route
    if (
      trimmed.includes("/storage/v1/object/public/comercial/") ||
      trimmed.includes("zzjfzxxvxbspbdkodoix.supabase.co")
    ) {
      if (baseName && baseName.endsWith(".png") || baseName.endsWith(".webp") || baseName.endsWith(".jpg")) {
        return `/storage/comercial/logos/${baseName}`;
      }
    }

    // 4. Valid local relative URL (e.g. /storage/comercial/logos/...)
    if (trimmed.startsWith("/") && !trimmed.includes("default-sponsor-logo.png")) {
      return trimmed;
    }

    // 5. Valid external URL (e.g. hosted CDN)
    if (
      (trimmed.startsWith("http://") || trimmed.startsWith("https://")) &&
      !trimmed.includes("zzjfzxxvxbspbdkodoix.supabase.co") &&
      !trimmed.includes("default-sponsor-logo.png")
    ) {
      return trimmed;
    }
  }

  // 6. Look up authentic asset by sponsor name
  const authenticByName = findAuthenticLogoByName(sponsorName);
  if (authenticByName) {
    return authenticByName;
  }

  // 7. Strictly fallback to default placeholder - NEVER fictitious logos
  return "/default-sponsor-logo.png";
}

/**
 * Backward compatibility alias: resolves to authentic logo or default image.
 * Fictitious SVG generation is permanently disabled.
 */
export function getSponsorBadgeDataUrl(sponsorName?: string | null): string {
  const authentic = findAuthenticLogoByName(sponsorName);
  return authentic || "/default-sponsor-logo.png";
}
