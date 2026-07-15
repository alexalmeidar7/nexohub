import { uploadImageToStorage } from "./uploadImageToStorage";

/**
 * Uploads a program image (thumb or capa) to Supabase Storage.
 * Returns the public URL.
 */
export async function uploadProgramImage(
  dataUrl: string,
  userId: string,
  programId: string,
  kind: "thumb" | "capa"
): Promise<string> {
  if (!dataUrl) return "";
  // Path MUST start with the authenticated user's id — Storage RLS on
  // "empresa-assets" requires (storage.foldername(name))[1] = auth.uid().
  const path = `${userId}/programas/${programId}_${kind}.webp`;
  return uploadImageToStorage(dataUrl, "empresa-assets", path);
}
