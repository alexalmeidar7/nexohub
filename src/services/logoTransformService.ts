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
    img.onerror = () => reject(new Error("Não foi possível abrir a imagem enviada."));
    img.src = src;
  });
}

/**
 * Renders the first page of a PDF into a PNG data URL, so PDFs can be adjusted
 * exactly like regular images.
 */
export async function pdfToPngDataUrl(file: File): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist");
  const workerSrc = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale: 1 });
  const scale = Math.min(4, Math.max(1, 1400 / Math.max(viewport.width, viewport.height)));
  const scaled = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = Math.round(scaled.width);
  canvas.height = Math.round(scaled.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível preparar o PDF.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: scaled }).promise;
  return canvas.toDataURL("image/png");
}

/**
 * Accepts any supported upload (PNG, JPG, WEBP, screenshot or PDF) and returns
 * a PNG data URL preserving every original pixel and color.
 */
export async function uploadToPngDataUrl(file: File): Promise<string> {
  if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
    return await pdfToPngDataUrl(file);
  }
  return await fileToDataUrl(file);
}

/**
 * Centers the image inside a square PNG canvas without altering colors,
 * text or details. Transparency is preserved as-is.
 */
export async function prepareSquarePngDataUrl(dataUrl: string, size = 1024): Promise<string> {
  const img = await loadImage(dataUrl);
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível inicializar o canvas.");

  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const padding = size * 0.04;
  const maxW = size - padding * 2;
  const maxH = size - padding * 2;
  const scale = Math.min(maxW / img.width, maxH / img.height);
  const drawW = img.width * scale;
  const drawH = img.height * scale;
  ctx.drawImage(img, (size - drawW) / 2, (size - drawH) / 2, drawW, drawH);
  return canvas.toDataURL("image/png");
}

/**
 * Final framing at 1080×1080 PNG RGBA. Colors, text and details are preserved
 * exactly; only the canvas size and centering change.
 */
export async function normalizeTo1080(dataUrl: string): Promise<string> {
  return await prepareSquarePngDataUrl(dataUrl, 1080);
}

/**
 * Sends the real uploaded artwork to the backend for background removal,
 * keeping every color, word and detail of the logo.
 * The API key never reaches the browser.
 */
export async function transformLogoWithBackend(params: {
  originalDataUrl: string;
  sessionId: string;
  version: string;
  isRetry?: boolean;
}): Promise<TransformResult> {
  const { originalDataUrl, sessionId, version, isRetry } = params;

  // Square PNG of the ORIGINAL artwork — no color or detail changes applied.
  const squarePngUrl = await prepareSquarePngDataUrl(originalDataUrl, 1024);

  const failure = async (error: string, code?: string): Promise<TransformResult> => ({
    success: false,
    error,
    code,
    version,
    imageBase64: await normalizeTo1080(squarePngUrl),
    width: 1080,
    height: 1080,
    sessionId,
    isAiGenerated: false,
  });

  try {
    const { data, error } = await supabase.functions.invoke("transform-logo", {
      body: { originalDataUrl: squarePngUrl, sessionId, version, isRetry: Boolean(isRetry) },
    });

    if (error) {
      return await failure(error.message || "Não foi possível ajustar a logo agora.", "INVOKE_ERROR");
    }

    if (data?.success && data?.imageBase64) {
      return {
        success: true,
        version: data.version || version,
        imageBase64: await forceWhiteLogo(await normalizeTo1080(data.imageBase64)),
        width: 1080,
        height: 1080,
        sessionId: data.sessionId || sessionId,
        isAiGenerated: true,
      };
    }

    return await failure(
      data?.error || "O ajuste automático não retornou uma logo.",
      data?.code || "AI_ERROR",
    );
  } catch (err: any) {
    return await failure(err?.message || "Não foi possível ajustar a logo agora.", "NETWORK_ERROR");
  }
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

/**
 * Converts every visible pixel to pure white #FFFFFF keeping the alpha channel,
 * so the adjusted logo is always the white version on transparent background.
 */
export async function forceWhiteLogo(dataUrl: string): Promise<string> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const p = d.data;
  for (let i = 0; i < p.length; i += 4) {
    p[i] = 255; p[i + 1] = 255; p[i + 2] = 255;
  }
  ctx.putImageData(d, 0, 0);
  return canvas.toDataURL("image/png");
}
