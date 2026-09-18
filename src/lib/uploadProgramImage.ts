import { supabase } from "@/integrations/supabase/client";
import { compressImage } from "./imageCompressor";

/**
 * Uploads a program image (thumb or capa) to Supabase Storage with multiple bucket fallbacks.
 * If storage upload fails (e.g., RLS, network, or bucket limits), returns the compressed
 * base64 WebP Data URL so the image is NEVER lost and is successfully saved to the database.
 */
export async function uploadProgramImage(
  dataUrl: string,
  userId: string,
  programId: string,
  kind: "thumb" | "capa"
): Promise<string> {
  if (!dataUrl) return "";
  // Already an HTTP / CDN URL: preserve as-is
  if (dataUrl.startsWith("http://") || dataUrl.startsWith("https://")) {
    return dataUrl;
  }

  try {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const ext = blob.type.includes("png") ? "png" : "jpg";
    const file = new File([blob], `program_${kind}.${ext}`, { type: blob.type });

    // Dimension limits based on kind: capa is 600×800, thumb is 1920×1080
    const maxDim = kind === "capa" ? 800 : 1920;
    const compressed = await compressImage(file, maxDim, maxDim, 0.85);

    const safeUid = userId || "global";
    const fileName = `${programId}_${kind}_${Date.now()}.webp`;
    const path = `${safeUid}/programas/${fileName}`;

    // 1. Try 'comercial' bucket
    try {
      const { data, error } = await supabase.storage
        .from("comercial")
        .upload(path, compressed, { upsert: true, contentType: "image/webp", cacheControl: "3600" });
      if (!error && data) {
        const { data: pubData } = supabase.storage.from("comercial").getPublicUrl(path);
        if (pubData?.publicUrl) return `${pubData.publicUrl}?t=${Date.now()}`;
      }
    } catch (e) {
      console.warn("[uploadProgramImage] comercial bucket notice:", e);
    }

    // 2. Try 'empresa-assets' bucket
    try {
      const { data, error } = await supabase.storage
        .from("empresa-assets")
        .upload(path, compressed, { upsert: true, contentType: "image/webp", cacheControl: "3600" });
      if (!error && data) {
        const { data: pubData } = supabase.storage.from("empresa-assets").getPublicUrl(path);
        if (pubData?.publicUrl) return `${pubData.publicUrl}?t=${Date.now()}`;
      }
    } catch (e) {
      console.warn("[uploadProgramImage] empresa-assets bucket notice:", e);
    }

    // 3. Try 'programas' bucket
    try {
      const { data, error } = await supabase.storage
        .from("programas")
        .upload(path, compressed, { upsert: true, contentType: "image/webp", cacheControl: "3600" });
      if (!error && data) {
        const { data: pubData } = supabase.storage.from("programas").getPublicUrl(path);
        if (pubData?.publicUrl) return `${pubData.publicUrl}?t=${Date.now()}`;
      }
    } catch (e) {
      console.warn("[uploadProgramImage] programas bucket notice:", e);
    }

    // 4. Safe fallback: return compressed base64 WebP Data URL so the image is saved to DB
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(dataUrl);
      reader.readAsDataURL(compressed);
    });
  } catch (err) {
    console.warn("[uploadProgramImage] fallback to input dataUrl:", err);
    return dataUrl;
  }
}

