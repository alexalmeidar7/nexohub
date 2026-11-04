const pngCache = new Map<string, string>();

/** Materializes any remote image as a real PNG object in the public XML bucket. */
export async function ensureVmixPngUrl(
  supabase: any,
  source: string | null | undefined,
  folder: string,
): Promise<string> {
  const original = String(source || "").trim();
  if (!original) return "";
  if (/\.png(?:$|[?#])/i.test(original)) return original;
  if (!/^https?:\/\//i.test(original)) return "";

  const cacheKey = `${folder}:${original}`;
  const cached = pngCache.get(cacheKey);
  if (cached) return cached;

  try {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(original));
    const hash = Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 32);
    const path = `${folder.replace(/^\/+|\/+$/g, "")}/${hash}.png`;
    const { data: publicData } = supabase.storage.from("xml-files").getPublicUrl(path);
    const publicUrl = publicData?.publicUrl || "";
    if (!publicUrl) return "";

    const { data: existing } = await supabase.storage.from("xml-files").list(folder, { search: `${hash}.png`, limit: 1 });
    if (!existing?.some(file => file.name === `${hash}.png`)) {
      const convertUrl = `https://wsrv.nl/?url=${encodeURIComponent(original)}&output=png&w=1920&h=1920`;
      const response = await fetch(convertUrl, { signal: AbortSignal.timeout(12000) });
      if (!response.ok) throw new Error(`PNG conversion HTTP ${response.status}`);
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("image/png")) throw new Error("Conversor não retornou image/png");
      const bytes = new Uint8Array(await response.arrayBuffer());
      const { error } = await supabase.storage.from("xml-files").upload(path, bytes, {
        upsert: true,
        contentType: "image/png",
        cacheControl: "31536000",
      });
      if (error) throw error;
    }
    pngCache.set(cacheKey, publicUrl);
    return publicUrl;
  } catch (error) {
    console.error("[ensureVmixPngUrl] conversão falhou:", error);
    return "";
  }
}
