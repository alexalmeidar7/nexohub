import { useState, useEffect, useRef } from "react";

export type AlbumColors = [string, string];

// Default elegant deep indigo/sapphire ambient tones
const DEFAULT_COLORS: AlbumColors = ["#0055ff", "#7c3aed"];
const cache = new Map<string, AlbumColors>();

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [Math.round(h * 360), s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360 / 360;
  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(x => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0")).join("");
}

/**
 * Optimizes an RGB color for atmospheric ambient gradient usage:
 * Guarantees rich saturation and ideal luminance so the gradient
 * glows elegantly without blowing out contrast or falling into muddy black.
 */
function optimizeForBackground(rgb: [number, number, number], isSecondary = false): string {
  let [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);

  // Boost saturation for vibrant atmospheric illumination
  s = Math.max(0.70, Math.min(1.0, s * 1.45));

  // Keep lightness in the sweet spot for ambient dark backdrops: 34% - 50%
  if (l < 0.22) {
    l = 0.38;
  } else if (l > 0.65) {
    l = 0.48;
  } else {
    l = Math.max(0.34, Math.min(0.50, l));
  }

  if (isSecondary) {
    l = Math.max(0.28, l * 0.95);
  }

  const [r, g, b] = hslToRgb(h, s, l);
  return rgbToHex(r, g, b);
}

/**
 * Loads image safely with CORS proxy fallback to bypass origin restrictions
 */
function loadImageWithFallback(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const isLocal =
      url.startsWith("data:") ||
      url.startsWith("blob:") ||
      url.startsWith("/") ||
      (typeof window !== "undefined" && url.includes(window.location.host));

    const tryDirect = () => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.referrerPolicy = "no-referrer";
      img.onload = () => resolve(img);
      img.onerror = () => {
        if (!isLocal) {
          tryProxy();
        } else {
          reject(new Error("Direct image load failed"));
        }
      };
      img.src = url;
    };

    const tryProxy = () => {
      const proxyImg = new Image();
      proxyImg.crossOrigin = "anonymous";
      proxyImg.referrerPolicy = "no-referrer";
      proxyImg.onload = () => resolve(proxyImg);
      proxyImg.onerror = () => reject(new Error("Proxy image load failed"));
      // weserv proxy resizes to 80x80 and guarantees CORS headers
      proxyImg.src = `https://images.weserv.nl/?url=${encodeURIComponent(url)}&w=80&h=80&fit=cover&output=jpg`;
    };

    tryDirect();
  });
}

function extractColors(url: string): Promise<AlbumColors> {
  return new Promise(async (resolve) => {
    if (!url) { resolve(DEFAULT_COLORS); return; }
    if (cache.has(url)) { resolve(cache.get(url)!); return; }

    try {
      const img = await loadImageWithFallback(url);
      const SIZE = 64;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) { resolve(DEFAULT_COLORS); return; }

      ctx.drawImage(img, 0, 0, SIZE, SIZE);
      const { data } = ctx.getImageData(0, 0, SIZE, SIZE);

      // Quantize into 16 hue buckets and calculate vibrancy scores
      interface Bucket {
        hue: number;
        rSum: number;
        gSum: number;
        bSum: number;
        count: number;
        score: number;
      }

      const buckets: Bucket[] = Array.from({ length: 16 }, (_, i) => ({
        hue: i * 22.5,
        rSum: 0,
        gSum: 0,
        bSum: 0,
        count: 0,
        score: 0,
      }));

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 180) continue;

        const [h, s, l] = rgbToHsl(r, g, b);
        // Exclude extreme near-blacks and near-whites from dominant hue detection
        if (l < 0.08 || l > 0.94) continue;

        const bucketIdx = Math.min(15, Math.floor((h % 360) / 22.5));
        const bucket = buckets[bucketIdx];

        // Favor saturated, mid-tone colors that produce stunning gradients
        const weight = (s * 1.8 + 0.2) * (1 - Math.abs(l - 0.5) * 0.7);
        bucket.rSum += r * weight;
        bucket.gSum += g * weight;
        bucket.bSum += b * weight;
        bucket.count += weight;
        bucket.score += weight;
      }

      // Sort buckets by prominence/vibrancy score
      const activeBuckets = buckets.filter(b => b.count > 0).sort((a, b) => b.score - a.score);

      if (activeBuckets.length === 0) {
        cache.set(url, DEFAULT_COLORS);
        resolve(DEFAULT_COLORS);
        return;
      }

      const top1 = activeBuckets[0];
      const rgb1: [number, number, number] = [
        Math.round(top1.rSum / top1.count),
        Math.round(top1.gSum / top1.count),
        Math.round(top1.bSum / top1.count),
      ];

      // Find secondary bucket with distinct hue (>= 40 degrees apart)
      const top2 = activeBuckets.find(b => {
        const diff = Math.abs(b.hue - top1.hue);
        const circularDiff = Math.min(diff, 360 - diff);
        return circularDiff >= 40;
      });

      let rgb2: [number, number, number];
      if (top2) {
        rgb2 = [
          Math.round(top2.rSum / top2.count),
          Math.round(top2.gSum / top2.count),
          Math.round(top2.bSum / top2.count),
        ];
      } else {
        // Monochromatic cover: generate an elegant harmonic complementary color (+45° hue shift)
        const [h1, s1, l1] = rgbToHsl(rgb1[0], rgb1[1], rgb1[2]);
        const harmonicH = (h1 + 45) % 360;
        rgb2 = hslToRgb(harmonicH, Math.max(0.65, s1), Math.max(0.32, l1 * 0.9));
      }

      const c1 = optimizeForBackground(rgb1);
      const c2 = optimizeForBackground(rgb2, true);

      const result: AlbumColors = [c1, c2];
      cache.set(url, result);
      resolve(result);
    } catch {
      resolve(DEFAULT_COLORS);
    }
  });
}

export function useAlbumColors(imageUrl: string | null | undefined): AlbumColors {
  const [colors, setColors] = useState<AlbumColors>(() => {
    if (imageUrl && cache.has(imageUrl)) return cache.get(imageUrl)!;
    return DEFAULT_COLORS;
  });
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!imageUrl) {
      setColors(DEFAULT_COLORS);
      return;
    }

    if (cache.has(imageUrl)) {
      setColors(cache.get(imageUrl)!);
      return;
    }

    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(async () => {
      const result = await extractColors(imageUrl);
      setColors(result);
    }, 80);

    return () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    };
  }, [imageUrl]);

  return colors;
}
