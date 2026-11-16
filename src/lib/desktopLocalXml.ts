type DesktopImageFileCache = Pick<NonNullable<Window["houseMixDesktop"]>, "cacheImageFileUrl" | "getCachedImageFileUrl">;

const XML_URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const XML_LEAF_PATTERN = /<([a-z_][\w:.-]*)\b[^>]*>([^<>]*)<\/\1>/gi;
const IMAGE_TAG_PATTERN = /logo|foto|imagem|image|thumb|capa|banner|background|fundo|ico|icon|artist_img/i;
const IMAGE_EXTENSION_PATTERN = /\.(?:png|jpe?g|webp|gif|avif|svg|bmp|tiff?)$/i;

function decodeXmlUrl(value: string) {
  return value.replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function collectXmlImageUrls(xml: string) {
  const images = new Map<string, { url: string; hint: string }>();
  for (const match of xml.matchAll(XML_LEAF_PATTERN)) {
    const tag = match[1];
    const value = match[2];
    for (const urlMatch of value.matchAll(XML_URL_PATTERN)) {
      const rawUrl = urlMatch[0];
      const url = decodeXmlUrl(rawUrl);
      let hasImageExtension = false;
      try { hasImageExtension = IMAGE_EXTENSION_PATTERN.test(new URL(url).pathname); } catch { /* Ignore invalid URLs. */ }
      if (IMAGE_TAG_PATTERN.test(tag) || hasImageExtension) images.set(rawUrl, { url, hint: tag });
    }
  }
  return images;
}

/** Replaces XML image URLs with file:// URLs for files cached under House Mix Desktop. */
export async function localizeXmlImageUrls(
  xml: string,
  slug: string,
  desktop: DesktopImageFileCache,
  cacheOnly = false,
  fallbacks?: Record<string, string> | Promise<Record<string, string>>,
) {
  const images = collectXmlImageUrls(xml);
  const entries = [...images.entries()];
  const replacements = new Map<string, string>();
  let index = 0;
  const worker = async () => {
    while (true) {
      const entry = entries[index++];
      if (!entry) return;
      const [rawUrl, image] = entry;
      const resolveImage = cacheOnly ? desktop.getCachedImageFileUrl : desktop.cacheImageFileUrl;
      let localUrl = await resolveImage(image.url, image.hint, slug).catch(() => null);
      if (!localUrl && fallbacks) {
        const localFallbacks = await fallbacks;
        localUrl = localFallbacks[image.hint] || null;
      }
      // Never leave an XML image pointing to the cloud while running offline.
      replacements.set(rawUrl, localUrl || "");
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, entries.length) }, worker));
  return xml.replace(XML_URL_PATTERN, (url) => replacements.has(url) ? replacements.get(url)! : url);
}
