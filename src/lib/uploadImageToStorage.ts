import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "./imageCompressor";

/**
 * Uploads an image (base64 data URL) to Supabase Storage and returns the public URL.
 * If the value is already a URL (not base64), returns it as-is.
 * @param dataUrl - base64 data URL or existing URL
 * @param bucket - storage bucket name
 * @param path - storage path (e.g., "apresentadores/userId/id.webp")
 * @param maxSize - max dimension for compression (default 1920)
 * @param quality - compression quality (default 0.82)
 */
export async function uploadImageToStorage(
  dataUrl: string,
  bucket: string,
  path: string,
  maxSize = 1920,
  quality = 0.82,
  local?: { slug: string; hint: string }
): Promise<string> {
  // Already a storage/http URL — keep as-is
  if (!dataUrl.startsWith("data:")) return dataUrl;

  // Convert base64 data URL to File
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const ext = blob.type.includes("png") ? "png" : "jpg";
  const file = new File([blob], `image.${ext}`, { type: blob.type });

  // Compress
  const compressed = await compressImage(file, maxSize, maxSize, quality);

  const finalExt = compressed.type.includes("webp") ? "webp" : ext;
  const finalPath = path.replace(/\.[^.]+$/, `.${finalExt}`);

  // HMD keeps the new image on this account's machine before attempting cloud sync.
  if (window.houseMixDesktop && local?.slug) {
    try { await window.houseMixDesktop.saveLocalImage(local.slug, await compressed.arrayBuffer(), compressed.type, local.hint); }
    catch { throw new Error("Não foi possível salvar a imagem localmente. O envio para a nuvem foi interrompido."); }
  }

  const { error } = await supabase.storage
    .from(bucket)
    .upload(finalPath, compressed, { upsert: true, contentType: compressed.type, cacheControl: "3600" });

  if (error) {
    console.error("Upload error:", error);
    return dataUrl; // fallback to base64
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(finalPath);
  return `${urlData.publicUrl}?t=${Date.now()}`;
}
