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
  const path = `programas/${userId}/${programId}_${kind}.webp`;
  return uploadImageToStorage(dataUrl, "empresa-assets", path);
}
