/**
 * Extrai duas cores dominantes de uma imagem para compor um gradiente elegante.
 * Usa canvas com crossOrigin=anonymous. Se a imagem não permitir CORS,
 * retorna null e o chamador deve usar cores padrão.
 */

export type DominantPair = { primary: string; secondary: string };

const memCache = new Map<string, DominantPair | null>();

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: h * 360, s, l };
}

function toHex(r: number, g: number, b: number) {
  const to = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

/**
 * Quantiza pixels em 24 bins de HSL e retorna as duas cores mais frequentes
 * dando preferência a matizes distintos e saturação alta.
 */
export async function extractDominantPair(imageUrl: string): Promise<DominantPair | null> {
  if (!imageUrl) return null;
  const cached = memCache.get(imageUrl);
  if (cached !== undefined) return cached;

  const result = await new Promise<DominantPair | null>((resolve) => {
    try {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.decoding = "async";
      img.onload = () => {
        try {
          const S = 48; // downscale
          const canvas = document.createElement("canvas");
          canvas.width = S; canvas.height = S;
          const ctx = canvas.getContext("2d", { willReadFrequently: true } as any);
          if (!ctx) return resolve(null);
          ctx.drawImage(img, 0, 0, S, S);
          const { data } = ctx.getImageData(0, 0, S, S);

          const bins = new Map<number, { r: number; g: number; b: number; count: number; s: number; l: number; h: number }>();
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
            if (a < 200) continue;
            const { h, s, l } = rgbToHsl(r, g, b);
            if (l < 0.08 || l > 0.92) continue;   // ignora quase-preto/branco
            if (s < 0.12) continue;                 // ignora cinza
            const bin = Math.floor(h / 15);         // 24 bins de matiz
            const cur = bins.get(bin);
            if (cur) {
              cur.r += r; cur.g += g; cur.b += b; cur.count += 1;
              cur.s += s; cur.l += l; cur.h += h;
            } else {
              bins.set(bin, { r, g, b, count: 1, s, l, h });
            }
          }

          if (bins.size === 0) return resolve(null);
          const arr = Array.from(bins.values())
            .map((b) => ({
              r: b.r / b.count, g: b.g / b.count, bl: b.b / b.count,
              count: b.count, sat: b.s / b.count, lum: b.l / b.count, hue: b.h / b.count,
            }))
            .sort((a, b) => (b.count * (0.6 + b.sat) - a.count * (0.6 + a.sat)));

          const primary = arr[0];
          // Escolhe secundária com hue diferente (>60°) preferencialmente
          const secondary = arr.slice(1).find((c) => Math.abs(c.hue - primary.hue) > 60) || arr[1] || primary;

          resolve({
            primary: toHex(primary.r, primary.g, primary.bl),
            secondary: toHex(secondary.r, secondary.g, secondary.bl),
          });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = imageUrl;
    } catch {
      resolve(null);
    }
  });

  memCache.set(imageUrl, result);
  return result;
}
