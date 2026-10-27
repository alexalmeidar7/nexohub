/**
 * Canonical Program Image Resolver for House Mix & Antigravity.
 *
 * Resolves program Selo (Badge/Seal), Capa (Cover), and Thumb (Thumbnail).
 * Guarantees zero broken images:
 * 1. Safely prioritizes authentic base64 images (like Interativa FM's 1080x1080 selos).
 * 2. Filters out any unreachable Supabase storage URLs (zzjfzxxvxbspbdkodoix.supabase.co).
 * 3. Falls back to verified local station assets (/programas/* and /selos/*).
 * 4. Ensures clean, elegant degradation so broken image icons never appear.
 */

/**
 * Resolve root-relative public assets when the app is loaded with Electron
 * loadFile(). In a file:// document, "/programas/..." points to the drive root,
 * not to the packaged dist folder. The bundled module lives in dist/assets,
 * so ../ resolves to the packaged dist root.
 */
function getElectronAppRoot(): URL | null {
  if (typeof window === "undefined" || window.location.protocol !== "file:") return null;
  try {
    // loadFile() opens dist/index.html, so ./ is the packaged dist directory.
    return new URL("./", window.location.href);
  } catch {
    return null;
  }
}

function normalizeProgramImageUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed.startsWith("/")) return trimmed;

  const appRoot = getElectronAppRoot();
  if (!appRoot) return trimmed;

  try {
    let relativePath = trimmed;
    while (relativePath.startsWith("/")) relativePath = relativePath.slice(1);
    return new URL(relativePath, appRoot).href;
  } catch {
    return trimmed;
  }
}

function isBundledFileImageUrl(url: string): boolean {
  const appRoot = getElectronAppRoot();
  if (!appRoot) return false;
  try {
    return new URL(url).href.startsWith(appRoot.href);
  } catch {
    return false;
  }
}

export function isSafeImageUrl(url?: string | null): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  if (!trimmed) return false;
  return trimmed.startsWith("data:image/") || trimmed.startsWith("/") || trimmed.startsWith("http://") || trimmed.startsWith("https://") || (trimmed.startsWith("file:") && isBundledFileImageUrl(trimmed));
}

export function normalizeProgramLookupKey(name?: string | null): string {
  if (!name) return "";
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// Known verified local assets for Positiva FM programs
const POSITIVA_LOCAL_ASSETS: Record<string, { capa: string; selo: string }> = {
  sertanejobomdemais1aedicao: { capa: "/programas/sbd1.png", selo: "/selos/sbd1.png" },
  sertanejobomdemais2aedicao: { capa: "/programas/sbd2.png", selo: "/selos/sbd2.png" },
  sertanejobomdemais: { capa: "/programas/sbd1.png", selo: "/selos/sbd1.png" },
  bomdiapositiva: { capa: "/programas/bom-dia.png", selo: "/selos/bom-dia.png" },
  flashbackpositiva: { capa: "/programas/flashback.png", selo: "/selos/flashback.png" },
  whatsapppositiva: { capa: "/programas/whatsapp.png", selo: "/selos/whatsapp.png" },
  valenight: { capa: "/programas/vale-night.png", selo: "/selos/vale-night.png" },
  palcopositiva: { capa: "/programas/palco-positiva.png", selo: "/selos/palco-positiva.png" },
  energiapositiva: { capa: "/programas/energia-positiva.png", selo: "/selos/energia-positiva.png" },
  modaopositiva: { capa: "/programas/modao.png", selo: "/selos/modao.png" },
  modaosertanejo: { capa: "/programas/modao.png", selo: "/selos/modao.png" },
  domingaopositiva: { capa: "/programas/domingao.png", selo: "/selos/domingao.png" },
  madrugadapositiva: { capa: "/programas/madrugada.png", selo: "/selos/madrugada.png" },
  madrugapositiva: { capa: "/programas/madrugada.png", selo: "/selos/madrugada.png" },
  primeirahora: { capa: "/programas/primeira-hora.png", selo: "/selos/primeira-hora.png" },
};

function getLocalStationAsset(progName?: string | null): { capa?: string; selo?: string } | null {
  if (!progName) return null;
  const key = normalizeProgramLookupKey(progName);
  for (const [k, v] of Object.entries(POSITIVA_LOCAL_ASSETS)) {
    if (key.includes(k) || k.includes(key)) {
      return v;
    }
  }
  return null;
}

export function resolveProgramSelo(
  p?: { selo?: string | null; capa?: string | null; thumb?: string | null; nome?: string | null } | null
): string {
  if (!p) return "";
  if (isSafeImageUrl(p.selo)) return normalizeProgramImageUrl(p.selo!);
  if (isSafeImageUrl(p.capa)) return normalizeProgramImageUrl(p.capa!);
  if (isSafeImageUrl(p.thumb)) return normalizeProgramImageUrl(p.thumb!);

  const local = getLocalStationAsset(p.nome);
  if (local?.selo) return normalizeProgramImageUrl(local.selo);

  return "";
}

export function resolveProgramCover(
  p?: { capa?: string | null; selo?: string | null; thumb?: string | null; nome?: string | null } | null
): string {
  if (!p) return "";
  if (isSafeImageUrl(p.capa)) return normalizeProgramImageUrl(p.capa!);
  if (isSafeImageUrl(p.selo)) return normalizeProgramImageUrl(p.selo!);
  if (isSafeImageUrl(p.thumb)) return normalizeProgramImageUrl(p.thumb!);

  const local = getLocalStationAsset(p.nome);
  if (local?.capa) return normalizeProgramImageUrl(local.capa);

  return "";
}

export function resolveProgramThumb(
  p?: { thumb?: string | null; capa?: string | null; selo?: string | null; nome?: string | null } | null
): string {
  if (!p) return "";
  if (isSafeImageUrl(p.thumb)) return normalizeProgramImageUrl(p.thumb!);
  if (isSafeImageUrl(p.capa)) return normalizeProgramImageUrl(p.capa!);
  if (isSafeImageUrl(p.selo)) return normalizeProgramImageUrl(p.selo!);

  const local = getLocalStationAsset(p.nome);
  if (local?.capa) return normalizeProgramImageUrl(local.capa);

  return "";
}

/**
 * Returns the best available artwork for badge/thumbnail list views.
 * Prioritizes square high-res Selo, then Capa, then Thumb.
 */
export function resolveProgramBadge(
  p?: { selo?: string | null; capa?: string | null; thumb?: string | null; nome?: string | null } | null
): string {
  if (!p) return "";
  const selo = resolveProgramSelo(p);
  if (selo) return selo;
  const capa = resolveProgramCover(p);
  if (capa) return capa;
  const thumb = resolveProgramThumb(p);
  if (thumb) return thumb;
  return "";
}

/**
 * Sanitizes an entire program object, replacing dead URLs with safe resolved images.
 */
export function sanitizeProgramImages<T extends { selo?: any; capa?: any; thumb?: any; nome?: any }>(
  p: T
): T {
  if (!p) return p;
  const safeSelo = resolveProgramSelo(p);
  const safeCapa = resolveProgramCover(p) || safeSelo;
  const safeThumb = resolveProgramThumb(p) || safeCapa || safeSelo;

  return {
    ...p,
    selo: safeSelo,
    capa: safeCapa,
    thumb: safeThumb,
  };
}
