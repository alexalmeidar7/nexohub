type Desktop = NonNullable<Window["houseMixDesktop"]>;
export interface PromotionBanner {
  id: string;
  user_id: string;
  nome?: string;
  imagem_url?: string | null;
  banner_l_url?: string | null;
  data_inicio?: string | null;
  data_fim?: string | null;
}
interface LocalBanner {
  id: string;
  url: string;
  source: string;
  start?: string | null;
  end?: string | null;
}
const snapshots = new Map<string, LocalBanner[]>();
const writes = new Map<string, Promise<unknown>>();
const key = (slug: string) => `nexohub_local_banner_l_${slug}`;
export const BANNER_DURATION_MS = 5000;

function readBanners(slug: string): LocalBanner[] {
  if (snapshots.has(slug)) return snapshots.get(slug)!;
  try {
    const stored = JSON.parse(localStorage.getItem(key(slug)) || "[]");
    if (Array.isArray(stored)) return stored.filter(b => typeof b.url === "string" && b.url.startsWith("file://"));
  } catch { /* Storage can be unavailable; the in-memory snapshot still works. */ }
  return [];
}

/** Downloads every registered image; only dedicated Banner L images enter the loop. */
export async function cachePromotionBanners(
  promotions: PromotionBanner[], ownerId: string, slug: string,
  desktop: Pick<Desktop, "cacheImageFileUrl" | "getCachedImageFileUrl">,
) {
  const rows = promotions.filter(p => p.user_id === ownerId).sort((a, b) => a.id.localeCompare(b.id));
  const previous = new Map(readBanners(slug).map(b => [b.id, b]));
  const banners: LocalBanner[] = [];
  const failed: string[] = [];
  const downloads = new Map<string, Promise<string | null>>();
  const resolve = (url: string) => {
    if (!downloads.has(url)) downloads.set(url, (async () => {
      const cached = await desktop.getCachedImageFileUrl(url, "banners", slug).catch(() => null);
      if (cached?.includes("/imagens/banners/")) return cached;
      // The native cache copies legacy catch-all files into the correct folder.
      return await desktop.cacheImageFileUrl(url, "banners", slug).catch(() => null) || cached;
    })());
    return downloads.get(url)!;
  };
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(4, rows.length) }, async () => {
    while (index < rows.length) {
      const promo = rows[index++];
      if (promo.imagem_url?.trim()) await resolve(promo.imagem_url.trim());
      if (!promo.banner_l_url?.trim()) continue;
      const localUrl = await resolve(promo.banner_l_url.trim());
      if (localUrl?.startsWith("file://")) {
        banners.push({ id: promo.id, url: localUrl, source: promo.banner_l_url.trim(), start: promo.data_inicio, end: promo.data_fim });
      } else {
        // Keep the last downloaded artwork available during a temporary outage.
        const cached = previous.get(promo.id);
        if (cached?.source) {
          const existing = await desktop.getCachedImageFileUrl(cached.source, "banners", slug).catch(() => null);
          if (existing?.startsWith("file://")) banners.push({ ...cached, url: existing, start: promo.data_inicio, end: promo.data_fim });
        }
        failed.push(promo.nome || promo.id);
      }
    }
  }));
  banners.sort((a, b) => a.id.localeCompare(b.id));
  snapshots.set(slug, banners);
  try { localStorage.setItem(key(slug), JSON.stringify(banners)); } catch { /* Keep memory snapshot. */ }
  return { registered: rows.filter(p => p.banner_l_url?.trim()).length, cached: banners.length, failed };
}

export function applyLocalPromotionBanner(xml: string, slug: string, now = Date.now()) {
  if (!/<banner_l\b/i.test(xml)) return xml;
  // There is no authoritative local list until the first successful sync.
  if (!snapshots.has(slug)) {
    try { if (!localStorage.getItem(key(slug))) return xml; }
    catch { return xml; }
  }
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const banners = readBanners(slug).filter(b => (!b.start || b.start <= today) && (!b.end || b.end >= today));
  const url = banners.length ? banners[Math.floor(now / BANNER_DURATION_MS) % banners.length].url : "";
  const escaped = url.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return xml.replace(/<banner_l\b[^>]*(?:\/>|>[\s\S]*?<\/banner_l>)/gi, `<banner_l>${escaped}</banner_l>`);
}

// All renderer XML writers share this queue so a rotation cannot overwrite a
// newer feed with an older read. The rotation is applied immediately before save.
function enqueue<T>(slug: string, filename: string, task: () => Promise<T>): Promise<T> {
  const id = `${slug}/${filename}`;
  const result = (writes.get(id) || Promise.resolve()).catch(() => {}).then(task);
  writes.set(id, result);
  void result.finally(() => { if (writes.get(id) === result) writes.delete(id); }).catch(() => {});
  return result;
}

export function saveDesktopXml(desktop: Pick<Desktop, "saveXml">, slug: string, filename: string, xml: string) {
  return enqueue(slug, filename, () => desktop.saveXml(slug, filename, applyLocalPromotionBanner(xml, slug)));
}

export function rotateDesktopBanner(desktop: Pick<Desktop, "readXml" | "saveXml">, slug: string, filename: string) {
  return enqueue(slug, filename, async () => {
    const xml = await desktop.readXml(slug, filename);
    if (!xml) return;
    const next = applyLocalPromotionBanner(xml, slug);
    if (next !== xml) await desktop.saveXml(slug, filename, next);
  });
}
