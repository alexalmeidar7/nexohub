/**
 * Extrai duas cores dominantes de uma imagem (capa) via canvas + quantização
 * simples por bucket (5 bits/canal). Retorna null se a imagem não puder ser
 * lida (CORS, offline, etc.).
 */
import { useEffect, useRef, useState } from "react";

export interface CoverPalette {
  primary: string;   // cor dominante
  secondary: string; // segunda cor mais distinta
}

const cache = new Map<string, CoverPalette | null>();

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

function colorDistance(a: [number, number, number], b: [number, number, number]) {
  const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
  return dr * dr + dg * dg + db * db;
}

async function extractFromUrl(url: string): Promise<CoverPalette | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 64;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
        for (let i = 0; i < data.length; i += 4) {
          const a = data[i + 3];
          if (a < 200) continue;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          // Ignora quase-preto e quase-branco extremos (mantém tons vivos)
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          if (max < 20) continue;
          if (min > 240) continue;
          const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
          const cur = buckets.get(key);
          if (cur) { cur.count++; cur.r += r; cur.g += g; cur.b += b; }
          else buckets.set(key, { count: 1, r, g, b });
        }
        if (buckets.size === 0) return resolve(null);

        const sorted = [...buckets.values()]
          .map((b) => ({
            count: b.count,
            rgb: [Math.round(b.r / b.count), Math.round(b.g / b.count), Math.round(b.b / b.count)] as [number, number, number],
          }))
          .sort((a, b) => b.count - a.count);

        const primary = sorted[0].rgb;
        // Segunda cor: a mais frequente que seja perceptualmente distinta da primária
        let secondary = primary;
        for (const c of sorted.slice(1, 40)) {
          if (colorDistance(c.rgb, primary) > 4000) { secondary = c.rgb; break; }
        }
        // Fallback: escurece a primária se não achou distinta
        if (secondary === primary) {
          secondary = [
            Math.max(0, Math.round(primary[0] * 0.45)),
            Math.max(0, Math.round(primary[1] * 0.45)),
            Math.max(0, Math.round(primary[2] * 0.45)),
          ];
        }
        resolve({
          primary: rgbToHex(primary[0], primary[1], primary[2]),
          secondary: rgbToHex(secondary[0], secondary[1], secondary[2]),
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function useCoverPalette(url: string | null | undefined): CoverPalette | null {
  const [palette, setPalette] = useState<CoverPalette | null>(url ? cache.get(url) ?? null : null);
  const activeRef = useRef<string | null>(null);

  useEffect(() => {
    activeRef.current = url ?? null;
    if (!url) { setPalette(null); return; }
    if (cache.has(url)) { setPalette(cache.get(url) ?? null); return; }
    let cancelled = false;
    void extractFromUrl(url).then((p) => {
      cache.set(url, p);
      if (!cancelled && activeRef.current === url) setPalette(p);
    });
    return () => { cancelled = true; };
  }, [url]);

  return palette;
}
