import { supabase } from "@/integrations/supabase/client";
import { preserveWhiteLogoDetails } from "@/services/whiteLogoPixels";

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
  const buffer = await file.arrayBuffer();

  // Carrega o worker da mesma versão do pdfjs-dist diretamente do CDN para
  // evitar falhas em hosts que publicam o bundle, mas não o asset com hash.
  pdfjs.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@6.3.289/build/pdf.worker.min.mjs";

  let pdf: any;
  try {
    pdf = await pdfjs.getDocument({ data: buffer }).promise;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    throw new Error(
      detail
        ? `Não foi possível carregar o leitor de PDF. Verifique a conexão e tente novamente. (${detail})`
        : "Não foi possível carregar o leitor de PDF. Verifique a conexão e tente novamente."
    );
  }

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
/**
 * Local flat-white logo preparation: removes the edge-connected background,
 * converts the remaining artwork to #FFFFFF, and exports transparent 1080 PNG.
 */
export async function vectorizeWhiteLogo1080(dataUrl: string): Promise<string> {
  const img = await loadImage(dataUrl);
  const size = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Não foi possível iniciar o ajuste da logo.");
  ctx.clearRect(0, 0, size, size);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  const padding = size * 0.1;
  const scale = Math.min((size - padding * 2) / img.width, (size - padding * 2) / img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  ctx.drawImage(img, Math.round((size - w) / 2), Math.round((size - h) / 2), w, h);

  const image = ctx.getImageData(0, 0, size, size);
  const px = image.data;
  const total = size * size;
  const samples: number[][] = [];
  const left = Math.max(0, Math.round((size - w) / 2));
  const top = Math.max(0, Math.round((size - h) / 2));
  const right = Math.min(size - 1, left + w - 1);
  const bottom = Math.min(size - 1, top + h - 1);
  // Sample the edges of the uploaded artwork (not the transparent canvas padding).
  for (let x = left; x <= right; x += 8) {
    for (const y of [top, Math.min(bottom, top + 1), Math.max(top, bottom - 1), bottom]) {
      const i = (y * size + x) * 4;
      if (px[i + 3] > 200) samples.push([px[i], px[i + 1], px[i + 2]]);
    }
  }
  for (let y = top; y <= bottom; y += 8) {
    for (const x of [left, Math.min(right, left + 1), Math.max(left, right - 1), right]) {
      const i = (y * size + x) * 4;
      if (px[i + 3] > 200) samples.push([px[i], px[i + 1], px[i + 2]]);
    }
  }
  const bins = new Map<string, { count: number; sum: number[] }>();
  // Arte que já tem borda transparente não precisa de remoção de fundo: só vira branco.
  const edgeProbes = (Math.ceil((right - left + 1) / 8) + Math.ceil((bottom - top + 1) / 8)) * 4;
  const alreadyTransparent = samples.length < edgeProbes * 0.25;
  for (const rgb of samples) {
    const key = rgb.map(v => Math.round(v / 24)).join(",");
    const item = bins.get(key);
    if (item) { item.count++; item.sum = item.sum.map((v, i) => v + rgb[i]); }
    else bins.set(key, { count: 1, sum: [...rgb] });
  }
  const dominant = [...bins.values()].sort((a, b) => b.count - a.count)[0];
  const bg = dominant ? dominant.sum.map(v => v / dominant.count) : [255, 255, 255];

  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;
  const tolerance = 62;
  const push = (index: number) => {
    if (index < 0 || index >= total || visited[index]) return;
    const i = index * 4;
    if (px[i + 3] < 12) { visited[index] = 1; queue[tail++] = index; return; }
    const dr = px[i] - bg[0], dg = px[i + 1] - bg[1], db = px[i + 2] - bg[2];
    if (Math.sqrt(dr * dr + dg * dg + db * db) <= tolerance) {
      visited[index] = 1;
      queue[tail++] = index;
    }
  };
  for (let x = 0; x < size; x++) { push(x); push((size - 1) * size + x); }
  for (let y = 0; y < size; y++) { push(y * size); push(y * size + size - 1); }
  while (!alreadyTransparent && head < tail) {
    const index = queue[head++];
    const x = index % size, y = Math.floor(index / size), i = index * 4;
    if (px[i + 3] > 0) {
      const dr = px[i] - bg[0], dg = px[i + 1] - bg[1], db = px[i + 2] - bg[2];
      const distance = Math.sqrt(dr * dr + dg * dg + db * db);
      px[i + 3] = distance < tolerance - 12 ? 0 : Math.round(px[i + 3] * Math.min(1, (distance - tolerance + 12) / 12));
    }
    if (x > 0) push(index - 1);
    if (x < size - 1) push(index + 1);
    if (y > 0) push(index - size);
    if (y < size - 1) push(index + size);
  }
  preserveWhiteLogoDetails(px);
  let visible = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] > 0) visible++;
  }
  if (visible < 100) throw new Error("Não foi possível separar a logo do fundo. Envie uma imagem com maior contraste ou fundo transparente.");
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL("image/png");
}

export async function normalizeTo1080(dataUrl: string): Promise<string> {
  return await prepareSquarePngDataUrl(dataUrl, 1080);
}

/**
 * Rejects the common failed edit where the service returns an opaque square or
 * rectangle instead of a cut-out logo. A valid transparent logo must retain
 * meaningful transparent space around its outer canvas.
 */
async function validateTransparentLogo(dataUrl: string): Promise<void> {
  const img = await loadImage(dataUrl);
  const sampleSize = 256;
  const canvas = document.createElement("canvas");
  canvas.width = sampleSize;
  canvas.height = sampleSize;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Não foi possível validar a transparência da logo.");
  ctx.clearRect(0, 0, sampleSize, sampleSize);
  ctx.drawImage(img, 0, 0, sampleSize, sampleSize);
  const pixels = ctx.getImageData(0, 0, sampleSize, sampleSize).data;
  let opaque = 0;
  let borderOpaque = 0;
  let borderPixels = 0;
  const border = 8;

  for (let y = 0; y < sampleSize; y += 1) {
    for (let x = 0; x < sampleSize; x += 1) {
      const alpha = pixels[(y * sampleSize + x) * 4 + 3];
      if (alpha > 24) opaque += 1;
      if (x < border || y < border || x >= sampleSize - border || y >= sampleSize - border) {
        borderPixels += 1;
        if (alpha > 24) borderOpaque += 1;
      }
    }
  }

  const opaqueRatio = opaque / (sampleSize * sampleSize);
  const borderOpaqueRatio = borderOpaque / borderPixels;
  if (opaqueRatio > 0.82 || borderOpaqueRatio > 0.7) {
    throw new Error("O ajuste retornou um fundo preenchido em vez de uma logo transparente. Tente outra opção.");
  }
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
      const normalized = await normalizeTo1080(data.imageBase64);
      await validateTransparentLogo(normalized);
      return {
        success: true,
        version: data.version || version,
        imageBase64: await forceWhiteLogo(normalized),
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
 * Converts artwork to white, retaining contrasting details as transparent cutouts.
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
  if (!ctx) throw new Error("Não foi possível converter a logo para branco.");
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, canvas.width, canvas.height);
  preserveWhiteLogoDetails(d.data);
  ctx.putImageData(d, 0, 0);
  return canvas.toDataURL("image/png");
}
