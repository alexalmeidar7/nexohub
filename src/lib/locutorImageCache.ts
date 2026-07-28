/**
 * Cache das imagens dos locutores/apresentadores.
 *
 * O browser já cacheia via HTTP, mas ao trocar de programa a <img> nova
 * volta ao estado "loading" e mostra skeleton por alguns ms mesmo com a
 * imagem já em disco. Este cache mantém, em memória e sessionStorage,
 * o conjunto de URLs já pré-carregadas nesta sessão, permitindo pular o
 * skeleton e evitar re-decodes.
 *
 * Camadas:
 *  1) Memória do módulo (síncrono, compartilhado entre componentes).
 *  2) sessionStorage (persiste durante a sessão do player).
 *  3) Deduplicação de preloads em voo por URL.
 */

const SS_KEY = "nexo:locutorImgCache:v1";
const MAX_ENTRIES = 200;

const loaded = new Set<string>();
const failed = new Set<string>();
const inflight = new Map<string, Promise<boolean>>();

let hydrated = false;

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.sessionStorage.getItem(SS_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw) as string[];
    if (Array.isArray(arr)) arr.forEach((u) => loaded.add(u));
  } catch { /* ignore */ }
}

function persist() {
  if (typeof window === "undefined") return;
  try {
    const arr = Array.from(loaded).slice(-MAX_ENTRIES);
    window.sessionStorage.setItem(SS_KEY, JSON.stringify(arr));
  } catch { /* quota */ }
}

export function isLocutorImageCached(url?: string | null): boolean {
  if (!url) return false;
  hydrate();
  return loaded.has(url);
}

export function markLocutorImageLoaded(url?: string | null) {
  if (!url) return;
  hydrate();
  if (loaded.has(url)) return;
  loaded.add(url);
  persist();
}

export function preloadLocutorImage(url?: string | null): Promise<boolean> {
  if (!url) return Promise.resolve(false);
  hydrate();
  if (loaded.has(url)) return Promise.resolve(true);
  if (failed.has(url)) return Promise.resolve(false);
  const flying = inflight.get(url);
  if (flying) return flying;

  const p = new Promise<boolean>((resolve) => {
    try {
      const img = new Image();
      // decoding assíncrono para não bloquear a UI
      (img as any).decoding = "async";
      img.loading = "eager";
      img.onload = async () => {
        try { await (img as any).decode?.(); } catch { /* ignore */ }
        loaded.add(url);
        persist();
        inflight.delete(url);
        resolve(true);
      };
      img.onerror = () => {
        failed.add(url);
        inflight.delete(url);
        resolve(false);
      };
      img.src = url;
    } catch {
      inflight.delete(url);
      resolve(false);
    }
  });

  inflight.set(url, p);
  return p;
}

export function preloadLocutorImages(urls: Array<string | null | undefined>) {
  const seen = new Set<string>();
  urls.forEach((u) => {
    if (!u || seen.has(u)) return;
    seen.add(u);
    // dispara em background sem await
    preloadLocutorImage(u);
  });
}
