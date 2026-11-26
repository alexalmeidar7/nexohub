const compactImages = new Map<string, Promise<string>>();

// Smaller encoded surfaces make WebView tile recovery cheaper after it drops
// its decoded-image cache. Keep the original URL when CORS or decoding fails.
export function compactTvHomeImage(url: string, maxWidth: number, maxHeight: number): Promise<string> {
  if (!/NexoPlayerTV\//i.test(navigator.userAgent) || !/^https?:\/\//i.test(url)
      || typeof createImageBitmap !== "function") return Promise.resolve(url);

  const key = `${maxWidth}x${maxHeight}:${url}`;
  const cached = compactImages.get(key);
  if (cached) return cached;
  const job = makeCompactImage(url, maxWidth, maxHeight).catch(() => url);
  compactImages.set(key, job);
  if (compactImages.size > 8) {
    const oldest = compactImages.keys().next().value;
    if (oldest) compactImages.delete(oldest);
  }
  return job;
}

async function makeCompactImage(url: string, maxWidth: number, maxHeight: number): Promise<string> {
  const response = await fetch(url, { cache: "force-cache", signal: AbortSignal.timeout(5000) });
  if (!response.ok || !/^image\/(?:png|webp|jpeg|avif)(?:;|$)/i.test(response.headers.get("content-type") || "")) return url;
  const image = await createImageBitmap(await response.blob());
  try {
    const scale = Math.min(maxWidth / image.width, maxHeight / image.height);
    if (scale >= .85) return url;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    try {
      const graphics = canvas.getContext("2d");
      if (!graphics) return url;
      graphics.imageSmoothingQuality = "high";
      graphics.drawImage(image, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/webp", .94));
      if (blob?.type !== "image/webp") return url;
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
      const decoded = new Image();
      decoded.src = data;
      await decoded.decode();
      return data;
    } finally {
      canvas.width = canvas.height = 0;
    }
  } finally {
    image.close();
  }
}
