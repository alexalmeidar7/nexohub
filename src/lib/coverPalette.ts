/**
 * Extrai duas cores dominantes de uma imagem (capa) via canvas + quantização
 * simples por bucket (5 bits/canal). Retorna null se a imagem não puder ser
 * lida (CORS, offline, etc.).
 */
import { useEffect, useRef, useState } from "react";

export interface CoverPalette {
  primary: string;   // cor dominante
  secondary: string; // segunda cor mais distinta
  tertiary?: string; // terceira cor amostrada de outro ponto da capa
}


/** Contraste automático derivado da paleta para garantir legibilidade. */
export interface PaletteContrast {
  /** Luminância média perceptual do gradiente (0..1). */
  luminance: number;
  /** Cor de texto ideal (#fff ou #0a0a0a). */
  textColor: string;
  /** Cor de texto secundário/muted com opacidade adequada. */
  textMutedColor: string;
  /** CSS background para scrim sobre o gradiente, calibrado por luminância. */
  scrimBackground: string;
  /** Text-shadow sutil para reforçar leitura em qualquer fundo. */
  textShadow: string;
}

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.replace("#", "");
  const n = m.length === 3
    ? m.split("").map((c) => parseInt(c + c, 16))
    : [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
  return [n[0] || 0, n[1] || 0, n[2] || 0];
}

function relLuminance([r, g, b]: [number, number, number]): number {
  // sRGB -> luminância relativa (WCAG)
  const f = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function getPaletteContrast(palette: CoverPalette | null): PaletteContrast | null {
  if (!palette) return null;
  const l1 = relLuminance(hexToRgb(palette.primary));
  const l2 = relLuminance(hexToRgb(palette.secondary));
  const luminance = (l1 + l2) / 2;

  // Fundo claro -> texto escuro; fundo escuro -> texto branco.
  const isLight = luminance > 0.55;
  const textColor = isLight ? "#0a0a0a" : "#ffffff";
  const textMutedColor = isLight ? "rgba(10,10,10,0.72)" : "rgba(255,255,255,0.78)";

  if (isLight) {
    // Scrim claro sutil para escurecer levemente e realçar texto escuro
    const a = Math.min(0.35, 0.15 + (luminance - 0.55) * 0.6);
    return {
      luminance,
      textColor,
      textMutedColor,
      scrimBackground: `linear-gradient(90deg, rgba(255,255,255,${(a * 0.4).toFixed(3)}) 0%, rgba(255,255,255,${a.toFixed(3)}) 100%)`,
      textShadow: "0 1px 2px rgba(255,255,255,0.35)",
    };
  }
  // Fundo escuro: escurece mais quanto mais claro estiver (0.2 baseline até ~0.55 max)
  const a = Math.min(0.55, 0.2 + (0.55 - luminance) * 0.25 + luminance * 0.4);
  return {
    luminance,
    textColor,
    textMutedColor,
    scrimBackground: `linear-gradient(90deg, rgba(0,0,0,${(a * 0.35).toFixed(3)}) 0%, rgba(0,0,0,${(a * 0.7).toFixed(3)}) 55%, rgba(0,0,0,${a.toFixed(3)}) 100%)`,
    textShadow: "0 1px 2px rgba(0,0,0,0.45)",
  };
}


const cache = new Map<string, CoverPalette | null>();
const inflight = new Map<string, Promise<CoverPalette | null>>();

const LS_PREFIX = "nexo:coverPalette:v1:";
const LS_MAX_ENTRIES = 200;

function cacheKey(url: string): string {
  // Normaliza query strings de cache-busting (?v=...&t=...) para o mesmo asset
  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.href : "http://x");
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

function lsGet(key: string): CoverPalette | null | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(LS_PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed === null) return null;
    if (parsed && typeof parsed.primary === "string" && typeof parsed.secondary === "string") return parsed;
    return undefined;
  } catch { return undefined; }
}

function lsSet(key: string, value: CoverPalette | null) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LS_PREFIX + key, JSON.stringify(value));
    // Poda simples: se passar do limite, remove ~25% dos mais antigos
    const keys = Object.keys(window.localStorage).filter((k) => k.startsWith(LS_PREFIX));
    if (keys.length > LS_MAX_ENTRIES) {
      keys.slice(0, Math.floor(LS_MAX_ENTRIES * 0.25)).forEach((k) => window.localStorage.removeItem(k));
    }
  } catch { /* quota / privado */ }
}

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
  const initial = (() => {
    if (!url) return null;
    const k = cacheKey(url);
    if (cache.has(k)) return cache.get(k) ?? null;
    const ls = lsGet(k);
    if (ls !== undefined) { cache.set(k, ls); return ls; }
    return null;
  })();
  const [palette, setPalette] = useState<CoverPalette | null>(initial);
  const activeRef = useRef<string | null>(null);

  useEffect(() => {
    activeRef.current = url ?? null;
    if (!url) { setPalette(null); return; }
    const k = cacheKey(url);

    if (cache.has(k)) { setPalette(cache.get(k) ?? null); return; }
    const ls = lsGet(k);
    if (ls !== undefined) { cache.set(k, ls); setPalette(ls); return; }

    let cancelled = false;
    let promise = inflight.get(k);
    if (!promise) {
      promise = extractFromUrl(url).then((p) => {
        cache.set(k, p);
        lsSet(k, p);
        inflight.delete(k);
        return p;
      });
      inflight.set(k, promise);
    }
    void promise.then((p) => {
      if (!cancelled && activeRef.current === url) setPalette(p);
    });
    return () => { cancelled = true; };
  }, [url]);

  return palette;
}

// ============================================================================
// Triad — 3 cores amostradas de pontos estratégicos da capa (usado no Modo DJ)
// ============================================================================

export interface CoverTriad {
  a: string; // topo/esquerda
  b: string; // centro
  c: string; // base/direita
}

const triadCache = new Map<string, CoverTriad | null>();
const triadInflight = new Map<string, Promise<CoverTriad | null>>();
const TRIAD_LS_PREFIX = "nexo:coverTriad:v1:";

function triadLsGet(key: string): CoverTriad | null | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(TRIAD_LS_PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed === null) return null;
    if (parsed && typeof parsed.a === "string" && typeof parsed.b === "string" && typeof parsed.c === "string") {
      return parsed;
    }
    return undefined;
  } catch { return undefined; }
}

function triadLsSet(key: string, value: CoverTriad | null) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TRIAD_LS_PREFIX + key, JSON.stringify(value));
    const keys = Object.keys(window.localStorage).filter((k) => k.startsWith(TRIAD_LS_PREFIX));
    if (keys.length > LS_MAX_ENTRIES) {
      keys.slice(0, Math.floor(LS_MAX_ENTRIES * 0.25)).forEach((k) => window.localStorage.removeItem(k));
    }
  } catch { /* quota / privado */ }
}

function averageColor(
  data: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
): [number, number, number] | null {
  let r = 0, g = 0, b = 0, count = 0;
  for (let y = y0; y < y0 + h; y++) {
    for (let x = x0; x < x0 + w; x++) {
      const i = (y * width + x) * 4;
      const a = data[i + 3];
      if (a < 128) continue;
      const rr = data[i], gg = data[i + 1], bb = data[i + 2];
      const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
      if (max < 20 || min > 245) continue; // ignora preto/branco puro
      r += rr; g += gg; b += bb; count++;
    }
  }
  if (count === 0) return null;
  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
}

function extractTriadFromUrl(url: string): Promise<CoverTriad | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const size = 48;
        const canvas = document.createElement("canvas");
        canvas.width = size; canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);

        // Três regiões de amostra: topo-esquerda, centro, base-direita
        const regionSize = 10;
        const a = averageColor(data, size, 2, 2, regionSize, regionSize);
        const b = averageColor(data, size, 19, 19, regionSize, regionSize);
        const c = averageColor(data, size, 36, 36, regionSize, regionSize);

        if (!a || !b || !c) return resolve(null);

        resolve({
          a: rgbToHex(a[0], a[1], a[2]),
          b: rgbToHex(b[0], b[1], b[2]),
          c: rgbToHex(c[0], c[1], c[2]),
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export function useCoverTriad(url: string | null | undefined): CoverTriad | null {
  const initial = (() => {
    if (!url) return null;
    const k = cacheKey(url);
    if (triadCache.has(k)) return triadCache.get(k) ?? null;
    const ls = triadLsGet(k);
    if (ls !== undefined) { triadCache.set(k, ls); return ls; }
    return null;
  })();
  const [triad, setTriad] = useState<CoverTriad | null>(initial);
  const activeRef = useRef<string | null>(null);

  useEffect(() => {
    activeRef.current = url ?? null;
    if (!url) { setTriad(null); return; }
    const k = cacheKey(url);
    if (triadCache.has(k)) { setTriad(triadCache.get(k) ?? null); return; }
    const ls = triadLsGet(k);
    if (ls !== undefined) { triadCache.set(k, ls); setTriad(ls); return; }

    let cancelled = false;
    let promise = triadInflight.get(k);
    if (!promise) {
      promise = extractTriadFromUrl(url).then((p) => {
        triadCache.set(k, p);
        triadLsSet(k, p);
        triadInflight.delete(k);
        return p;
      });
      triadInflight.set(k, promise);
    }
    void promise.then((p) => {
      if (!cancelled && activeRef.current === url) setTriad(p);
    });
    return () => { cancelled = true; };
  }, [url]);

  return triad;
}

