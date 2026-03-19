import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "./imageCompressor";

/**
 * Uploads a program image (thumb or capa) to Supabase Storage.
 * Returns the public URL. If the value is already a URL, returns it as-is.
 * If it's a base64 data URL, uploads it and returns the public URL.
 */
export async function uploadProgramImage(
  dataUrl: string,
  userId: string,
  programId: string,
  kind: "thumb" | "capa"
): Promise<string> {
  // Already a storage/http URL — keep as-is
  if (!dataUrl.startsWith("data:")) return dataUrl;

  // Convert base64 data URL to File
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const ext = blob.type.includes("png") ? "png" : "jpg";
  const file = new File([blob], `${kind}.${ext}`, { type: blob.type });

  // Compress
  const compressed = await compressImage(file, 1920, 1920, 0.82);

  const finalExt = compressed.type.includes("webp") ? "webp" : ext;
  const path = `programas/${userId}/${programId}_${kind}.${finalExt}`;

  const { error } = await supabase.storage
    .from("empresa-assets")
    .upload(path, compressed, { upsert: true, contentType: compressed.type, cacheControl: "3600" });

  if (error) {
    console.error("Upload error:", error);
    return dataUrl; // fallback to base64
  }

  const { data: urlData } = supabase.storage.from("empresa-assets").getPublicUrl(path);
  // Append cache-buster
  return `${urlData.publicUrl}?t=${Date.now()}`;
}
