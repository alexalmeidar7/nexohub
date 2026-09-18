import { supabase } from "@/integrations/supabase/client";

export interface TransformResult {
  success: boolean;
  version: string;
  imageBase64: string;
  width: number;
  height: number;
  sessionId: string;
  error?: string;
  code?: string;
  isAiGenerated?: boolean;
}

/**
 * Converts a browser File into a Data URL
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Loads an image into an HTMLImageElement
 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Converts any image format (PNG, JPG, WEBP) into a square PNG
 * suitable for OpenAI API image edits (1024x1024, RGBA)
 */
export async function prepareSquarePngDataUrl(dataUrl: string, size = 1024): Promise<string> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível inicializar o canvas.");

  ctx.clearRect(0, 0, size, size);

  // Contain scale within size with a safe padding
  const padding = size * 0.08;
  const maxW = size - padding * 2;
  const maxH = size - padding * 2;

  const scale = Math.min(maxW / img.width, maxH / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const drawX = (size - drawW) / 2;
  const drawY = (size - drawH) / 2;

  ctx.drawImage(img, drawX, drawY, drawW, drawH);
  return canvas.toDataURL("image/png");
}

/**
 * Ensures the result is strictly 1080×1080, PNG RGBA, 100% transparent background,
 * with pure white #FFFFFF flat vectors and preserved alpha edges.
 */
export async function normalizeTo1080PureWhite(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const size = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Não foi possível inicializar o canvas de normalização.");

  ctx.clearRect(0, 0, size, size);

  const padding = size * 0.08;
  const maxW = size - padding * 2;
  const maxH = size - padding * 2;
  const scale = Math.min(maxW / img.width, maxH / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  const drawX = (size - drawW) / 2;
  const drawY = (size - drawH) / 2;

  ctx.drawImage(img, drawX, drawY, drawW, drawH);

  // Convert pixels to pure #FFFFFF flat treatment while preserving transparency and antialiasing
  const imgData = ctx.getImageData(0, 0, size, size);
  const data = imgData.data;

  // Determine if image has dark background that needs thresholding or already has transparent alpha
  let hasTransparentPixels = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 240) {
      hasTransparentPixels = true;
      break;
    }
  }

  if (hasTransparentPixels) {
    // Already has alpha channel: turn every visible pixel into pure white (#FFFFFF), preserving alpha
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      if (alpha > 15) {
        data[i] = 255;     // R
        data[i + 1] = 255; // G
        data[i + 2] = 255; // B
        // Alpha is kept as-is for smooth antialiased outlines
      } else {
        data[i + 3] = 0;   // Fully transparent
      }
    }
  } else {
    // JPG or opaque background: sample corners to detect background luminance
    const cornerLums = [
      (data[0] + data[1] + data[2]) / 3,
      (data[(size - 1) * 4] + data[(size - 1) * 4 + 1] + data[(size - 1) * 4 + 2]) / 3,
      (data[(size * (size - 1)) * 4] + data[(size * (size - 1)) * 4 + 1] + data[(size * (size - 1)) * 4 + 2]) / 3,
    ];
    const avgBgLum = (cornerLums[0] + cornerLums[1] + cornerLums[2]) / 3;
    const isDarkBg = avgBgLum < 128;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      if (isDarkBg) {
        // Dark background: bright parts are the logo
        if (lum > 40) {
          const alpha = Math.min(255, Math.max(0, Math.round(((lum - 40) / 100) * 255)));
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
          data[i + 3] = alpha;
        } else {
          data[i + 3] = 0;
        }
      } else {
        // Light/White background: dark parts are the logo
        if (lum < 220) {
          const alpha = Math.min(255, Math.max(0, Math.round(((220 - lum) / 100) * 255)));
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
          data[i + 3] = alpha;
        } else {
          data[i + 3] = 0;
        }
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL("image/png");
}

/**
 * Dispatches logo transformation to backend (OpenAI API).
 * Never exposes the OpenAI API key to the client.
 */
export async function transformLogoWithBackend(params: {
  originalDataUrl: string;
  sessionId: string;
  version: string;
  isRetry?: boolean;
}): Promise<TransformResult> {
  const { originalDataUrl, sessionId, version, isRetry } = params;

  // 1. Ensure square PNG buffer for OpenAI
  const squarePngUrl = await prepareSquarePngDataUrl(originalDataUrl, 1024);

  // 2. Call local Vite backend endpoint first
  try {
    const res = await fetch("/api/transform-logo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        originalDataUrl: squarePngUrl,
        sessionId,
        version,
        isRetry: Boolean(isRetry),
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && data.imageBase64) {
        // Normalize returned AI image to exact 1080×1080 pure white PNG
        const normalized = await normalizeTo1080PureWhite(data.imageBase64);
        return {
          success: true,
          version: data.version || version,
          imageBase64: normalized,
          width: 1080,
          height: 1080,
          sessionId: data.sessionId || sessionId,
          isAiGenerated: true,
        };
      }

      // If backend reports no API key or OpenAI error, provide detailed error code
      if (data.code === "NO_API_KEY" || data.code === "OPENAI_API_ERROR") {
        // Generate high-resolution flat white vectorization locally as immediate preview
        const localNormalized = await normalizeTo1080PureWhite(squarePngUrl);
        return {
          success: false,
          error: data.error,
          code: data.code,
          version,
          imageBase64: localNormalized,
          width: 1080,
          height: 1080,
          sessionId,
          isAiGenerated: false,
        };
      }
    }
  } catch (err) {
    console.warn("[logoTransformService] Local endpoint unavailable, checking Supabase function:", err);
  }

  // 3. Fallback to Supabase Edge Function
  try {
    const { data, error } = await supabase.functions.invoke("transform-logo", {
      body: { originalDataUrl: squarePngUrl, sessionId, version },
    });

    if (!error && data?.success && data?.imageBase64) {
      const normalized = await normalizeTo1080PureWhite(data.imageBase64);
      return {
        success: true,
        version: data.version || version,
        imageBase64: normalized,
        width: 1080,
        height: 1080,
        sessionId: data.sessionId || sessionId,
        isAiGenerated: true,
      };
    }

    if (data?.code === "NO_API_KEY" || data?.code === "OPENAI_API_ERROR") {
      const localNormalized = await normalizeTo1080PureWhite(squarePngUrl);
      return {
        success: false,
        error: data.error,
        code: data.code,
        version,
        imageBase64: localNormalized,
        width: 1080,
        height: 1080,
        sessionId,
        isAiGenerated: false,
      };
    }
  } catch (supabaseErr) {
    console.warn("[logoTransformService] Supabase function error:", supabaseErr);
  }

  // 4. Default high-precision flat-white transformation fallback
  const localNormalized = await normalizeTo1080PureWhite(squarePngUrl);
  return {
    success: true,
    version,
    imageBase64: localNormalized,
    width: 1080,
    height: 1080,
    sessionId,
    isAiGenerated: false,
  };
}

/**
 * Converts a Base64 data URL back to a standard File object
 */
export function dataUrlToFile(dataUrl: string, filename: string): File {
  const arr = dataUrl.split(",");
  const mime = arr[0].match(/:(.*?);/)?.[1] || "image/png";
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}
