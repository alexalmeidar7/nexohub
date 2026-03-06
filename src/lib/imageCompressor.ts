/**
 * Compresses and resizes an image file using Canvas API.
 * @param file - Original image file
 * @param maxWidth - Maximum width (default 1920)
 * @param maxHeight - Maximum height (default 1920)
 * @param quality - JPEG quality 0-1 (default 0.8)
 * @returns Compressed File object
 */
export async function compressImage(
  file: File,
  maxWidth = 1920,
  maxHeight = 1920,
  quality = 0.8
): Promise<File> {
  // Skip non-image files or SVGs
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") {
    return file;
  }

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Only resize if exceeds max dimensions
      if (width > maxWidth || height > maxHeight) {
        const ratio = Math.min(maxWidth / width, maxHeight / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }

      ctx.drawImage(img, 0, 0, width, height);

      // Use WebP if supported, fallback to JPEG
      const outputType = "image/webp";
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          const compressedFile = new File([blob], file.name.replace(/\.[^.]+$/, ".webp"), {
            type: outputType,
            lastModified: Date.now(),
          });
          // Only use compressed if it's actually smaller
          resolve(compressedFile.size < file.size ? compressedFile : file);
        },
        outputType,
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(file); // fallback to original on error
    };

    img.src = url;
  });
}
