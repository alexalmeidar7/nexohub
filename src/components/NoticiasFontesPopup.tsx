import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Newspaper, Plus, Trash2, Loader2, X as XIcon, RefreshCw, ExternalLink, Globe, Settings, Pencil, Check, ChevronLeft, ChevronRight, Eye, Play, Pause, ChevronUp, ChevronDown, GripVertical } from "lucide-react";

const NEXO_CYAN = "#00BFF0";
const NEXO_CARD_BG = "#D6F4FB";
const NEXO_DARK = "#0A2540";

const PROXY = "https://api.allorigins.win/raw?url=";

type NewsItem = { title: string; link: string; thumbnail: string; pubDate: string; summary?: string };
type Site = { id: string; name: string; rss_url: string; parent_id?: string | null; category?: string | null };

function sanitizeTitle(t: string): string {
  return (t || "").replace(/\uFFFD/g, "").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(text: string): string {
  if (!text) return "";
  const el = document.createElement("textarea");
  el.innerHTML = text;
  return el.value;
}

function pickTag(block: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(re);
  if (!m) return "";
  let v = m[1].trim();
  const cd = v.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  if (cd) v = cd[1].trim();
  return v;
}

function parseRssRegex(xml: string): NewsItem[] {
  const results: NewsItem[] = [];
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi) || [];
  for (const block of blocks) {
    let rawTitle = decodeHtmlEntities(pickTag(block, "title"));
    let title = rawTitle.includes("|") ? rawTitle.split("|")[0].trim() : rawTitle;
    if (title.includes(" - ")) title = title.split(" - ")[0].trim();
    if (!title) continue;

    // Link: <link>URL</link> or <link href="URL"/>
    let link = pickTag(block, "link");
    if (!link) {
      const h = block.match(/<link[^>]*href=["']([^"']+)["']/i);
      if (h) link = h[1];
    }
    link = link.trim();

    const pubDate =
      pickTag(block, "pubDate") ||
      pickTag(block, "published") ||
      pickTag(block, "updated") ||
      pickTag(block, "dc:date") ||
      pickTag(block, "date") ||
      "";

    let thumbnail = "";
    const media = block.match(/<(?:media:content|media:thumbnail|thumbnail|content)[^>]*url=["']([^"']+)["']/i);
    if (media) thumbnail = media[1];
    if (!thumbnail) {
      const enc = block.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']image[^"']*["']/i)
        || block.match(/<enclosure[^>]*type=["']image[^"']*["'][^>]*url=["']([^"']+)["']/i);
      if (enc) thumbnail = enc[1];
    }
    if (!thumbnail) {
      const desc = pickTag(block, "description") || pickTag(block, "content:encoded") || pickTag(block, "summary");
      const im = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (im) thumbnail = im[1];
    }

    results.push({ title, link, thumbnail, pubDate });
  }
  return results;
}

function parseRss(xml: string): NewsItem[] {
  const results: NewsItem[] = [];
  try {
    const doc = new DOMParser().parseFromString(xml, "text/xml");
    // Detect XML parse error (Chrome/Firefox both surface a parsererror element)
    const hasParseError = !!doc.querySelector("parsererror");
    if (hasParseError) return parseRssRegex(xml);

    const items = doc.querySelectorAll("item, entry");
    items.forEach((item) => {
      let rawTitle = decodeHtmlEntities(item.querySelector("title")?.textContent?.trim() || "");
      let title = rawTitle.includes("|") ? rawTitle.split("|")[0].trim() : rawTitle;
      if (title.includes(" - ")) title = title.split(" - ")[0].trim();
      const linkEl = item.querySelector("link");
      const link = (linkEl?.textContent?.trim() || linkEl?.getAttribute("href") || "").trim();
      const pubDate =
        item.querySelector("pubDate")?.textContent?.trim() ||
        item.querySelector("published")?.textContent?.trim() ||
        item.querySelector("updated")?.textContent?.trim() ||
        item.querySelector("date")?.textContent?.trim() ||
        "";
      let thumbnail = "";
      const mediaContent = item.querySelector("content[url], thumbnail[url]");
      if (mediaContent) thumbnail = mediaContent.getAttribute("url") || "";
      if (!thumbnail) {
        const enc = item.querySelector("enclosure[url]");
        if (enc && (enc.getAttribute("type") || "").startsWith("image")) thumbnail = enc.getAttribute("url") || "";
      }
      if (!thumbnail) {
        const desc = item.querySelector("description")?.textContent || "";
        const m = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
        if (m) thumbnail = m[1];
      }
      if (title) results.push({ title, link, thumbnail, pubDate });
    });
  } catch {}
  // If DOM parsing produced nothing but the payload clearly has <item>, retry with regex
  if (results.length === 0 && /<(item|entry)[\s>]/i.test(xml)) {
    return parseRssRegex(xml);
  }
  return results;
}

function formatPubDate(pubDate: string): string {
  if (!pubDate) return "";
  const d = new Date(pubDate);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function parseHtmlNews(html: string, baseUrl: string): NewsItem[] {
  const results: NewsItem[] = [];
  const seen = new Set<string>();
  try {
    const doc = new DOMParser().parseFromString(html, "text/html");
    let base: URL | null = null;
    try { base = new URL(baseUrl); } catch {}

    // Prefer <article> blocks, then generic anchors with headings inside
    const articles = Array.from(doc.querySelectorAll("article, .post, .noticia, .card, .news-item, li.post"));
    const scan = (root: Element | Document) => {
      const anchors = Array.from(root.querySelectorAll("a[href]"));
      for (const a of anchors) {
        const href = a.getAttribute("href") || "";
        if (!href || href.startsWith("#") || href.startsWith("javascript:")) continue;
        let link = href;
        try { link = new URL(href, base || undefined).toString(); } catch { continue; }
        if (base && !link.startsWith(base.origin)) continue;
        // Skip navigation-ish links (category pages, home)
        try {
          const u = new URL(link);
          if (u.pathname === "/" || u.pathname.length < 8) continue;
        } catch {}

        // Find a title: heading inside, aria-label, title, or text
        const heading = a.querySelector("h1,h2,h3,h4,h5") as HTMLElement | null;
        let title = (heading?.textContent || a.getAttribute("aria-label") || a.getAttribute("title") || a.textContent || "").trim();
        title = decodeHtmlEntities(title).replace(/\s+/g, " ").trim();
        if (!title || title.length < 20 || title.length > 220) continue;
        if (title.includes("|")) title = title.split("|")[0].trim();

        if (seen.has(link)) continue;
        seen.add(link);

        // Try to find an image nearby
        let thumbnail = "";
        const img = a.querySelector("img") as HTMLImageElement | null;
        if (img) {
          thumbnail = img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-lazy-src") || "";
          const srcset = img.getAttribute("srcset") || "";
          if (!thumbnail && srcset) thumbnail = srcset.split(",")[0].trim().split(" ")[0];
          if (thumbnail) { try { thumbnail = new URL(thumbnail, base || undefined).toString(); } catch {} }
        }
        results.push({ title, link, thumbnail, pubDate: "" });
        if (results.length >= 30) return;
      }
    };
    if (articles.length) articles.forEach((el) => scan(el));
    if (results.length < 8) scan(doc);
  } catch {}
  return results.slice(0, 15);
}

async function callFetchRss(url: string, timeoutMs = 20000): Promise<string> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !supabaseKey) return "";
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/fetch-rss`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${supabaseKey}`, apikey: supabaseKey },
      body: JSON.stringify({ url }),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      console.warn("[NoticiasFontes] fetch-rss HTTP", res.status, url);
      return "";
    }
    const data = await res.json();
    if (data?.error) console.warn("[NoticiasFontes] fetch-rss error:", data.error, "url:", url);
    return typeof data?.content === "string" ? data.content : "";
  } catch (e: any) {
    console.warn("[NoticiasFontes] fetch-rss failed:", e?.message || e, "url:", url);
    return "";
  } finally {
    clearTimeout(t);
  }
}

async function fetchNews(rssUrl: string): Promise<NewsItem[]> {
  // Bust cache with timestamp so we always get fresh
  const cacheBust = `${rssUrl}${rssUrl.includes("?") ? "&" : "?"}_ts=${Date.now()}`;
  let rawContent = await callFetchRss(cacheBust);

  if (rawContent) {
    const r = parseRss(rawContent);
    if (r.length) {
      console.log("[NoticiasFontes] RSS OK:", r.length, "items ←", rssUrl);
      return r.slice(0, 15);
    }
  }

  if (!rawContent) {
    try {
      const res = await fetch(`${PROXY}${encodeURIComponent(cacheBust)}`, { cache: "no-store", signal: AbortSignal.timeout(12000) });
      rawContent = await res.text();
      const r = parseRss(rawContent);
      if (r.length) return r.slice(0, 15);
    } catch {}
  }

  // Fallback: not a valid RSS/Atom feed → treat as HTML page and scrape
  if (rawContent) {
    const html = parseHtmlNews(rawContent, rssUrl);
    if (html.length) {
      console.log("[NoticiasFontes] HTML scrape:", html.length, "items ←", rssUrl);
      return html;
    }
  }

  // Last resort: try common feed paths
  try {
    const base = new URL(rssUrl);
    const candidates = ["/feed", "/rss", "/feed/", "/rss.xml", "/index.xml", "/dynamo/rss2.xml"];
    for (const path of candidates) {
      if (base.pathname.replace(/\/$/, "") === path.replace(/\/$/, "")) continue;
      const tryUrl = `${base.origin}${path}?_ts=${Date.now()}`;
      const content = await callFetchRss(tryUrl, 12000);
      if (content) {
        const r = parseRss(content);
        if (r.length) {
          console.log("[NoticiasFontes] Auto-discovery feed:", tryUrl);
          return r.slice(0, 15);
        }
      }
    }
  } catch {}

  console.warn("[NoticiasFontes] Nenhuma notícia extraída para:", rssUrl);
  return [];
}

function NewsHorizontalScroller({
  items,
  siteId,
  blocosCount,
  onDropToBloco,
  initialBlocoItems,
  onBlocoItemsChange,
}: {
  items: NewsItem[];
  siteId: string;
  blocosCount: number;
  onDropToBloco: (bi: number, item: NewsItem) => void;
  initialBlocoItems?: Record<number, NewsItem[]>;
  onBlocoItemsChange?: (bi: number, items: NewsItem[]) => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number>(0);
  const lastFrameRef = useRef<number>(0);
  const targetSpeedRef = useRef(0);   // px/segundo desejado (sinal + magnitude)
  const currentSpeedRef = useRef(0);  // px/segundo suavizado
  const accRef = useRef(0);           // acumulador subpixel
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [dragging, setDragging] = useState(false);
  const draggedItemRef = useRef<NewsItem | null>(null);
  const [hoverBloco, setHoverBloco] = useState<number | null>(null);
  const [blocoItems, setBlocoItems] = useState<Record<number, NewsItem[]>>(() => initialBlocoItems || {});
  const [autoScroll, setAutoScroll] = useState(true);
  const autoScrollRef = useRef(true);
  const [scrollProgress, setScrollProgress] = useState(0); // 0..1
  const [visibleIndex, setVisibleIndex] = useState(1);
  const progressBarRef = useRef<HTMLDivElement>(null);
  const hoveringRef = useRef(false);
  const touchActiveRef = useRef(false);
  const touchStartXRef = useRef(0);
  const touchStartScrollRef = useRef(0);
  const touchLastXRef = useRef(0);
  const touchLastTsRef = useRef(0);
  const touchVelocityRef = useRef(0);
  const momentumRef = useRef(0);
  const AUTO_SPEED = 55; // px/s do modo auto

  // Hidrata blocos a partir das notícias já existentes quando a prop mudar
  useEffect(() => {
    if (initialBlocoItems) setBlocoItems(initialBlocoItems);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialBlocoItems]);

  // Wrapper: atualiza estado interno e notifica o pai
  const mutateBloco = (bi: number, updater: (cur: NewsItem[]) => NewsItem[]) => {
    setBlocoItems((prev) => {
      const cur = prev[bi] || [];
      const next = updater(cur);
      onBlocoItemsChange?.(bi, next);
      return { ...prev, [bi]: next };
    });
  };

  // Reset scroll ao trocar de site
  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollLeft = 0;
    targetSpeedRef.current = 0;
    currentSpeedRef.current = 0;
    accRef.current = 0;
    lastTsRef.current = 0;
    lastFrameRef.current = 0;
    momentumRef.current = 0;
    setExpanded({});
  }, [siteId]);

  // Loop time-based com cap ~60 FPS e lerp exponencial (independente de FPS)
  const tick = (ts: number) => {
    const el = scrollerRef.current;
    if (el) {
      const sinceFrame = ts - lastFrameRef.current;
      if (sinceFrame >= 15.5) {
        const prev = lastTsRef.current || ts;
        const dt = Math.min(0.05, Math.max(0.001, (ts - prev) / 1000));
        lastTsRef.current = ts;
        lastFrameRef.current = ts;

        // Alvo efetivo: pointer > touch momentum > auto-scroll (se não hover/touch)
        let effectiveTarget = targetSpeedRef.current;
        if (effectiveTarget === 0 && !touchActiveRef.current) {
          if (Math.abs(momentumRef.current) > 5) {
            // Momentum decai exponencialmente
            momentumRef.current *= Math.exp(-dt / 0.5);
            effectiveTarget = momentumRef.current;
          } else {
            momentumRef.current = 0;
            if (autoScrollRef.current && !hoveringRef.current) {
              // Loop: se chegou ao fim, volta ao início suavemente
              if (el.scrollLeft + el.clientWidth >= el.scrollWidth - 2) {
                el.scrollTo({ left: 0, behavior: "smooth" });
                effectiveTarget = 0;
              } else {
                effectiveTarget = AUTO_SPEED;
              }
            }
          }
        }

        const smoothing = 1 - Math.exp(-dt / 0.09);
        currentSpeedRef.current += (effectiveTarget - currentSpeedRef.current) * smoothing;

        const v = currentSpeedRef.current;
        if (Math.abs(v) > 2) {
          accRef.current += v * dt;
          const step = Math.trunc(accRef.current);
          if (step !== 0) { el.scrollLeft += step; accRef.current -= step; }
        } else {
          currentSpeedRef.current = 0;
          accRef.current = 0;
        }
      }
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pausa quando aba oculta (evita “salto” ao voltar)
  useEffect(() => {
    const onVis = () => {
      if (document.hidden) {
        targetSpeedRef.current = 0;
        currentSpeedRef.current = 0;
        accRef.current = 0;
        lastTsRef.current = 0;
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Velocidade máxima em px/s (antes era ~11 px/frame ≈ 660 px/s a 60fps)
  const MAX_SPEED = 900;
  const BASE_SPEED = 90;

  const setSpeedFromPointer = (clientX: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const zone = Math.min(180, rect.width * 0.18);
    if (x < zone) {
      const t = Math.max(0, Math.min(1, 1 - x / zone));
      // easeInOutCubic para arranque/parada extra suaves nas bordas
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      targetSpeedRef.current = -(BASE_SPEED + eased * (MAX_SPEED - BASE_SPEED));
    } else if (x > rect.width - zone) {
      const t = Math.max(0, Math.min(1, 1 - (rect.width - x) / zone));
      const eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      targetSpeedRef.current = BASE_SPEED + eased * (MAX_SPEED - BASE_SPEED);
    } else {
      targetSpeedRef.current = 0;
    }
  };

  useEffect(() => { autoScrollRef.current = autoScroll; }, [autoScroll]);

  const onMouseEnter = () => { hoveringRef.current = true; };
  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => { hoveringRef.current = true; setSpeedFromPointer(e.clientX); };
  const onMouseLeave = () => { hoveringRef.current = false; targetSpeedRef.current = 0; };

  const nudge = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(600, el.clientWidth * 0.8), behavior: "smooth" });
  };

  // Navegação por teclado: ← → para rolar, Espaço para play/pause auto-scroll, Home/End para extremos
  useEffect(() => {
    const isTypingTarget = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };
    const onKey = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const el = scrollerRef.current;
      if (!el) return;
      if (e.key === "ArrowRight") {
        e.preventDefault();
        nudge(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        nudge(-1);
      } else if (e.key === " " || e.code === "Space") {
        e.preventDefault();
        setAutoScroll((v) => !v);
      } else if (e.key === "Home") {
        e.preventDefault();
        el.scrollTo({ left: 0, behavior: "smooth" });
      } else if (e.key === "End") {
        e.preventDefault();
        el.scrollTo({ left: el.scrollWidth, behavior: "smooth" });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Touch / swipe navigation
  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el) return;
    const t = e.touches[0];
    touchActiveRef.current = true;
    touchStartXRef.current = t.clientX;
    touchStartScrollRef.current = el.scrollLeft;
    touchLastXRef.current = t.clientX;
    touchLastTsRef.current = performance.now();
    touchVelocityRef.current = 0;
    targetSpeedRef.current = 0;
    currentSpeedRef.current = 0;
    momentumRef.current = 0;
  };
  const onTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el || !touchActiveRef.current) return;
    const t = e.touches[0];
    const dx = touchStartXRef.current - t.clientX;
    el.scrollLeft = touchStartScrollRef.current + dx;
    const now = performance.now();
    const dt = Math.max(0.001, (now - touchLastTsRef.current) / 1000);
    touchVelocityRef.current = (touchLastXRef.current - t.clientX) / dt;
    touchLastXRef.current = t.clientX;
    touchLastTsRef.current = now;
  };
  const onTouchEnd = () => {
    touchActiveRef.current = false;
    // Momentum: velocidade final vira alvo com decaimento
    const v = touchVelocityRef.current;
    momentumRef.current = Math.max(-1600, Math.min(1600, v));
  };

  const toggleEye = (idx: number) => setExpanded((prev) => ({ ...prev, [idx]: !prev[idx] }));

  const updateProgress = () => {
    const el = scrollerRef.current;
    if (!el) return;
    const max = Math.max(1, el.scrollWidth - el.clientWidth);
    const p = Math.max(0, Math.min(1, el.scrollLeft / max));
    setScrollProgress(p);
    // Estimar item central visível
    const total = items.length || 1;
    const center = el.scrollLeft + el.clientWidth / 2;
    const approxItemW = el.scrollWidth / total;
    const idx = Math.max(1, Math.min(total, Math.round(center / approxItemW)));
    setVisibleIndex(idx);
  };

  useEffect(() => { updateProgress(); }, [items, siteId]);

  // Atualiza progresso a cada frame de scroll (o loop tick move scrollLeft direto, sem disparar onScroll de forma confiável)
  useEffect(() => {
    let raf = 0;
    const loop = () => { updateProgress(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const seekToProgress = (clientX: number) => {
    const el = scrollerRef.current;
    const bar = progressBarRef.current;
    if (!el || !bar) return;
    const rect = bar.getBoundingClientRect();
    const t = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    el.scrollTo({ left: t * max, behavior: "smooth" });
  };

  return (
    <div className="relative h-full w-full flex flex-col">
      {/* Área rolável */}
      <div className="relative flex-1 min-h-0" onMouseEnter={onMouseEnter} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 z-10" style={{ background: "linear-gradient(to right, #FAFCFD, rgba(250,252,253,0))" }} />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 z-10" style={{ background: "linear-gradient(to left, #FAFCFD, rgba(250,252,253,0))" }} />

        <button onClick={() => nudge(-1)} className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition" style={{ background: "#fff", color: NEXO_DARK, border: `1px solid ${NEXO_CYAN}44` }} aria-label="Anterior">
          <ChevronLeft size={18} />
        </button>
        <button onClick={() => nudge(1)} className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition" style={{ background: "#fff", color: NEXO_DARK, border: `1px solid ${NEXO_CYAN}44` }} aria-label="Próximo">
          <ChevronRight size={18} />
        </button>

        <button
          onClick={() => setAutoScroll((v) => !v)}
          className="absolute right-2 top-2 z-20 h-8 px-3 rounded-full flex items-center gap-1.5 text-xs font-semibold shadow-md hover:scale-105 transition"
          style={{ background: autoScroll ? NEXO_CYAN : "#fff", color: autoScroll ? "#fff" : NEXO_DARK, border: `1px solid ${NEXO_CYAN}66` }}
          aria-label={autoScroll ? "Pausar rolagem automática" : "Ativar rolagem automática"}
          title={autoScroll ? "Pausar auto-rolagem" : "Ativar auto-rolagem"}
        >
          {autoScroll ? <Pause size={14} /> : <Play size={14} />}
          <span>Auto</span>
        </button>

        {/* Indicador de progresso da rolagem */}
        <div className="absolute left-0 right-0 bottom-1 z-20 px-8 pointer-events-none">
          <div className="flex items-center gap-3">
            <div
              ref={progressBarRef}
              onClick={(e) => seekToProgress(e.clientX)}
              className="relative flex-1 h-1.5 rounded-full overflow-hidden cursor-pointer pointer-events-auto group"
              style={{ background: `${NEXO_DARK}22` }}
              title="Clique para navegar"
            >
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-150 ease-out"
                style={{ width: `${Math.round(scrollProgress * 100)}%`, background: `linear-gradient(90deg, ${NEXO_CYAN}, ${NEXO_DARK})` }}
              />
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `${Math.round(scrollProgress * 100)}%`, background: "#fff", border: `2px solid ${NEXO_CYAN}` }}
              />
            </div>
            <span className="text-[10px] font-bold tabular-nums px-2 py-0.5 rounded-full pointer-events-none" style={{ background: "#fff", color: NEXO_DARK, border: `1px solid ${NEXO_CYAN}44` }}>
              {visibleIndex}/{items.length}
            </span>
          </div>
        </div>


        <div
          ref={scrollerRef}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
          className="h-full w-full overflow-x-auto overflow-y-hidden flex items-stretch gap-4 px-8 py-6"
          style={{ scrollbarWidth: "thin", scrollBehavior: "auto", willChange: "scroll-position", touchAction: "pan-y" }}
        >
          {items.map((n, i) => {
            const dateLabel = formatPubDate(n.pubDate);
            const isOpen = !!expanded[i];
            const title = sanitizeTitle(n.title);
            return (
              <div
                key={`${siteId}-${i}`}
                draggable
                onDragStart={(e) => {
                  draggedItemRef.current = n;
                  setDragging(true);
                  try {
                    e.dataTransfer.effectAllowed = "copy";
                    e.dataTransfer.setData("application/x-noticia", JSON.stringify(n));
                    e.dataTransfer.setData("text/plain", title);
                  } catch {}
                }}
                onDragEnd={() => { setDragging(false); draggedItemRef.current = null; setHoverBloco(null); }}
                className="group shrink-0 rounded-2xl overflow-hidden flex flex-col hover:-translate-y-1 transition cursor-grab active:cursor-grabbing"
                style={{
                  width: 280,
                  background: NEXO_CARD_BG,
                  boxShadow: "0 6px 18px rgba(10,37,64,0.10)",
                  fontFamily: "'Montserrat', sans-serif",
                }}
              >
                <div className="w-full overflow-hidden" style={{ background: `${NEXO_DARK}0A`, aspectRatio: "4/3" }}>
                  {n.thumbnail ? (
                    <img src={n.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition" loading="lazy" referrerPolicy="no-referrer"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center" style={{ color: `${NEXO_DARK}55` }}>
                      <Newspaper size={38} />
                    </div>
                  )}
                </div>
                <div className="flex-1 flex flex-col p-5 gap-3">
                  <h3 className="text-[17px] leading-[1.15] font-black line-clamp-5" style={{ color: NEXO_DARK, letterSpacing: "-0.01em" }}>
                    {title}
                  </h3>
                  {isOpen && (
                    <p className="text-[12px] leading-snug" style={{ color: NEXO_DARK, opacity: 0.85, maxHeight: 120, overflow: "auto" }}>
                      {sanitizeTitle(n.summary || "") || "Sem resumo disponível para esta notícia."}
                    </p>
                  )}
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold" style={{ color: NEXO_DARK, opacity: 0.75 }}>
                      {dateLabel || " "}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {n.link && (
                        <a href={n.link} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()}
                          className="w-8 h-8 rounded-full flex items-center justify-center hover:scale-110 transition" title="Abrir no site"
                          style={{ background: "#fff", color: NEXO_DARK, border: `1px solid ${NEXO_CYAN}55` }}>
                          <ExternalLink size={14} />
                        </a>
                      )}
                      <button type="button" onClick={() => toggleEye(i)}
                        className="w-9 h-9 rounded-full flex items-center justify-center transition hover:scale-110"
                        style={{ background: isOpen ? NEXO_DARK : NEXO_CYAN, color: "#fff" }}
                        aria-label={isOpen ? "Fechar resumo" : "Abrir resumo"}
                        title={isOpen ? "Fechar resumo" : "Ver resumo"}>
                        <Eye size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Blocos - drop targets */}
      {blocosCount > 0 && (
        <div className="shrink-0 px-4 pt-3 pb-4 border-t" style={{ borderColor: "rgba(10,37,64,0.08)", background: "#F5FAFC" }}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: NEXO_DARK, opacity: 0.6 }}>
              Arraste a notícia para o bloco
            </span>
          </div>
          <div className="flex flex-wrap gap-2 items-stretch">
            {Array.from({ length: blocosCount }).map((_, bi) => {
              const isHover = hoverBloco === bi;
              const added = blocoItems[bi] || [];
              return (
                <div
                  key={bi}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setHoverBloco(bi); }}
                  onDragLeave={() => setHoverBloco((v) => (v === bi ? null : v))}
                  onDrop={(e) => {
                    e.preventDefault();
                    setHoverBloco(null);
                    // Ignora se for uma reordenação interna
                    const reorderRaw = e.dataTransfer.getData("application/x-noticia-reorder");
                    if (reorderRaw) return;
                    let item: NewsItem | null = draggedItemRef.current;
                    try {
                      const raw = e.dataTransfer.getData("application/x-noticia");
                      if (raw) item = JSON.parse(raw);
                    } catch {}
                    if (item) {
                      const it = item;
                      let added = false;
                      mutateBloco(bi, (cur) => {
                        if (cur.some((x) => x.link === it.link && x.title === it.title)) {
                          toast.warning("Notícia já adicionada neste bloco", {
                            description: it.title.slice(0, 80),
                          });
                          return cur;
                        }
                        added = true;
                        return [...cur, it];
                      });
                      if (added) onDropToBloco(bi, it);
                    }
                  }}
                  className="flex-1 min-w-[180px] rounded-xl flex flex-col transition overflow-hidden"
                  style={{
                    background: isHover ? NEXO_CYAN : "#fff",
                    color: isHover ? "#fff" : NEXO_DARK,
                    border: `2px ${dragging || isHover ? "solid" : "dashed"} ${NEXO_CYAN}`,
                    boxShadow: isHover ? "0 6px 18px rgba(0,191,240,0.35)" : "none",
                    fontFamily: "'Montserrat', sans-serif",
                    minHeight: "48px",
                  }}
                >
                  <div className="flex items-center justify-between gap-2 px-3 py-2">
                    <span className="text-[12px] font-black uppercase tracking-wider">
                      Bloco {bi + 1}
                    </span>
                    {added.length > 0 && (
                      <span
                        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{ background: isHover ? "#fff" : NEXO_CYAN, color: isHover ? NEXO_CYAN : "#fff" }}
                      >
                        {added.length}
                      </span>
                    )}
                  </div>
                  {added.length > 0 && (
                    <div className="flex flex-col gap-1 px-2 pb-2">
                      {added.map((n, idx) => (
                        <div
                          key={`${bi}-${idx}-${n.link}`}
                          draggable
                          onDragStart={(e) => {
                            e.stopPropagation();
                            e.dataTransfer.effectAllowed = "move";
                            e.dataTransfer.setData(
                              "application/x-noticia-reorder",
                              JSON.stringify({ bi, idx }),
                            );
                          }}
                          onDragOver={(e) => {
                            if (e.dataTransfer.types.includes("application/x-noticia-reorder")) {
                              e.preventDefault();
                              e.stopPropagation();
                              e.dataTransfer.dropEffect = "move";
                            }
                          }}
                          onDrop={(e) => {
                            const raw = e.dataTransfer.getData("application/x-noticia-reorder");
                            if (!raw) return;
                            e.preventDefault();
                            e.stopPropagation();
                            try {
                              const { bi: fromBi, idx: fromIdx } = JSON.parse(raw);
                              if (fromBi !== bi || fromIdx === idx) return;
                              mutateBloco(bi, (cur) => {
                                const arr = [...cur];
                                const [moved] = arr.splice(fromIdx, 1);
                                arr.splice(idx, 0, moved);
                                return arr;
                              });
                            } catch {}
                          }}
                          className="flex items-start gap-1 rounded-md px-2 py-1.5 text-[11px] leading-tight cursor-move"
                          style={{
                            background: isHover ? "rgba(255,255,255,0.18)" : "rgba(0,191,240,0.08)",
                            color: isHover ? "#fff" : NEXO_DARK,
                          }}
                        >
                          <GripVertical size={12} className="shrink-0 mt-0.5 opacity-50" />
                          <span className="font-black shrink-0 opacity-60">{idx + 1}.</span>
                          <span className="flex-1 font-semibold line-clamp-2" title={sanitizeTitle(n.title)}>
                            {sanitizeTitle(n.title)}
                          </span>
                          <div className="flex flex-col shrink-0 -my-0.5">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={(e) => {
                                e.stopPropagation();
                                mutateBloco(bi, (cur) => {
                                  if (idx <= 0) return cur;
                                  const arr = [...cur];
                                  [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                                  return arr;
                                });
                              }}
                              className="p-0.5 opacity-60 hover:opacity-100 disabled:opacity-20 transition"
                              aria-label="Mover para cima"
                              title="Mover para cima"
                              style={{ color: "inherit" }}
                            >
                              <ChevronUp size={11} />
                            </button>
                            <button
                              type="button"
                              disabled={idx === added.length - 1}
                              onClick={(e) => {
                                e.stopPropagation();
                                mutateBloco(bi, (cur) => {
                                  if (idx >= cur.length - 1) return cur;
                                  const arr = [...cur];
                                  [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                                  return arr;
                                });
                              }}
                              className="p-0.5 opacity-60 hover:opacity-100 disabled:opacity-20 transition"
                              aria-label="Mover para baixo"
                              title="Mover para baixo"
                              style={{ color: "inherit" }}
                            >
                              <ChevronDown size={11} />
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              mutateBloco(bi, (cur) => cur.filter((_, i) => i !== idx));
                            }}
                            className="shrink-0 opacity-60 hover:opacity-100 transition mt-0.5"
                            aria-label="Remover"
                            title="Remover do bloco"
                            style={{ color: "inherit" }}
                          >
                            <XIcon size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>
      )}
    </div>
  );
}


interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  blocosCount?: number;
  onAddNoticiaToBloco?: (blocoIndex: number, item: NewsItem) => void;
  initialBlocoItems?: Record<number, NewsItem[]>;
  onBlocoItemsChange?: (blocoIndex: number, items: NewsItem[]) => void;
}


export default function NoticiasFontesPopup({ open, onOpenChange, blocosCount = 0, onAddNoticiaToBloco, initialBlocoItems, onBlocoItemsChange }: Props) {
  const { user } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [newsBySite, setNewsBySite] = useState<Record<string, NewsItem[]>>({});
  const [loadingSite, setLoadingSite] = useState<Record<string, boolean>>({});
  const [newUrl, setNewUrl] = useState("");
  const [newName, setNewName] = useState("");
  const [newParentId, setNewParentId] = useState<string>("");
  const [newCategory, setNewCategory] = useState("");

  const [adding, setAdding] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [editParentId, setEditParentId] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);
  const tabsScrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const tabRefs = useRef<Record<string, HTMLDivElement | null>>({});

  useLayoutEffect(() => {
    if (!openMenuFor) { setMenuPos(null); return; }
    const el = tabRefs.current[openMenuFor];
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setMenuPos({ top: r.bottom + 6, left: r.left });
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [openMenuFor]);

  const updateScrollButtons = () => {
    const el = tabsScrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  };

  const scrollTabs = (dir: "left" | "right") => {
    const el = tabsScrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -220 : 220, behavior: "smooth" });
  };

  const loadSites = async (forceFetch = true) => {
    if (!user) return;
    setInitialLoading(true);
    const { data } = await supabase.from("custom_news_sites").select("id,name,rss_url,parent_id,category").eq("user_id", user.id).order("created_at", { ascending: true });
    const list = (data as Site[]) || [];
    setSites(list);

    // 1) Hidratação instantânea: puxa cache pronto do backend (atualizado a cada 5 min)
    if (list.length) {
      const { data: cached } = await supabase
        .from("news_cache")
        .select("site_id, items, updated_at")
        .in("site_id", list.map((s) => s.id));
      if (cached && cached.length) {
        const map: Record<string, NewsItem[]> = {};
        let newestTs = 0;
        for (const row of cached as any[]) {
          if (Array.isArray(row.items)) map[row.site_id] = row.items as NewsItem[];
          const ts = row.updated_at ? new Date(row.updated_at).getTime() : 0;
          if (ts > newestTs) newestTs = ts;
        }
        setNewsBySite((prev) => ({ ...map, ...prev }));
        if (newestTs) {
          try { localStorage.setItem("bot_news_cache_last_run", String(newestTs)); } catch {}
        }
      }
    }
    setInitialLoading(false);
    if (list.length && !activeTab) setActiveTab(list[0].id);

    // 2) Se cache está velho (>5min) OU forçado, dispara refresh backend em background
    const cacheAge = Number(localStorage.getItem("bot_news_cache_last_run") || "0");
    const isStale = !cacheAge || Date.now() - cacheAge > 5 * 60 * 1000;
    if (forceFetch && (isStale || list.length === 0)) {
      supabase.functions.invoke("refresh-news-cache", { body: {} }).then(async () => {
        // após refresh, recarrega do cache
        const { data: refreshed } = await supabase
          .from("news_cache")
          .select("site_id, items, updated_at")
          .in("site_id", list.map((s) => s.id));
        if (refreshed && refreshed.length) {
          const map: Record<string, NewsItem[]> = {};
          let newestTs = 0;
          for (const row of refreshed as any[]) {
            if (Array.isArray(row.items)) map[row.site_id] = row.items as NewsItem[];
            const ts = row.updated_at ? new Date(row.updated_at).getTime() : 0;
            if (ts > newestTs) newestTs = ts;
          }
          setNewsBySite(map);
          if (newestTs) {
            try { localStorage.setItem("bot_news_cache_last_run", String(newestTs)); } catch {}
          }
        }
      }).catch((e) => console.warn("[NoticiasFontes] refresh-news-cache falhou", e));
    }
  };

  const loadSiteNews = async (s: Site) => {
    setLoadingSite((prev) => ({ ...prev, [s.id]: true }));
    const news = await fetchNews(s.rss_url);
    setNewsBySite((prev) => ({ ...prev, [s.id]: news }));
    setLoadingSite((prev) => ({ ...prev, [s.id]: false }));
    // atualiza cache backend para essa fonte
    supabase.functions.invoke("refresh-news-cache", { body: { site_id: s.id } }).catch(() => {});
  };

  useEffect(() => {
    if (open) loadSites(true);
  }, [open, user?.id]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(updateScrollButtons, 30);
    const onResize = () => updateScrollButtons();
    window.addEventListener("resize", onResize);
    return () => { clearTimeout(t); window.removeEventListener("resize", onResize); };
  }, [open, sites.length]);

  useEffect(() => {
    if (!activeTab) return;
    const el = tabsScrollRef.current;
    if (!el) return;
    const btn = el.querySelector(`[data-tab-id="${activeTab}"]`) as HTMLElement | null;
    if (btn) btn.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [activeTab]);

  const addSite = async () => {
    if (!newUrl.trim() || !user) return;
    setAdding(true);
    let url = newUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const parentId = newParentId || null;
    const category = newCategory.trim() || null;
    const customName = newName.trim();
    let displayName = "";
    if (customName) {
      displayName = customName;
    } else if (parentId) {
      const parent = sites.find((x) => x.id === parentId);
      displayName = category || (parent ? parent.name : url);
    } else {
      try { displayName = new URL(url).hostname.replace(/^www\./, ""); } catch { displayName = url; }
    }
    const { data, error } = await supabase.from("custom_news_sites").insert({ user_id: user.id, name: displayName, rss_url: url, parent_id: parentId, category }).select("id,name,rss_url,parent_id,category").single();
    setAdding(false);
    if (error || !data) { toast.error("Não foi possível adicionar a fonte"); return; }
    setNewUrl("");
    setNewName("");
    setNewParentId("");
    setNewCategory("");

    const s = data as Site;
    setSites((prev) => [...prev, s]);
    if (!activeTab) setActiveTab(s.id);
  };

  const removeSite = async (id: string) => {
    setSites((prev) => prev.filter((s) => s.id !== id));
    setNewsBySite((prev) => { const c = { ...prev }; delete c[id]; return c; });
    if (activeTab === id) {
      const rest = sites.filter((s) => s.id !== id);
      setActiveTab(rest[0]?.id || "");
    }
    await supabase.from("custom_news_sites").delete().eq("id", id);
  };

  const startEdit = (s: Site) => {
    setEditingId(s.id);
    setEditName(s.name);
    setEditUrl(s.rss_url);
    setEditParentId(s.parent_id || "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditUrl("");
    setEditParentId("");
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim() || !editUrl.trim()) return;
    setSavingEdit(true);
    let url = editUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const name = editName.trim();
    const parentId = editParentId || null;
    // Prevent making a parent its own child, or nesting under one of its own children
    const isDescendant = (candidateId: string): boolean => {
      if (candidateId === id) return true;
      const child = sites.find((x) => x.id === candidateId);
      if (!child || !child.parent_id) return false;
      return isDescendant(child.parent_id);
    };
    if (parentId && isDescendant(parentId)) {
      setSavingEdit(false);
      return;
    }
    const category = parentId ? name : null;
    const { error } = await supabase.from("custom_news_sites").update({ name, rss_url: url, parent_id: parentId, category }).eq("id", id);
    setSavingEdit(false);
    if (error) return;
    const updated: Site = { id, name, rss_url: url, parent_id: parentId, category };
    setSites((prev) => prev.map((s) => (s.id === id ? updated : s)));
    setNewsBySite((prev) => { const c = { ...prev }; delete c[id]; return c; });
    cancelEdit();
    loadSiteNews(updated);
  };

  const closeSettings = () => {
    setShowSettings(false);
    // Refresh news for any newly-added sites without cache
    sites.forEach((s) => { if (!newsBySite[s.id] || newsBySite[s.id].length === 0) loadSiteNews(s); });
  };

  const totalNoticias = useMemo(() => Object.values(newsBySite).reduce((a, b) => a + b.length, 0), [newsBySite]);
  const activeSite = sites.find((s) => s.id === activeTab);
  const activeNews = activeSite ? newsBySite[activeSite.id] || [] : [];
  const activeLoading = activeSite ? loadingSite[activeSite.id] : false;

  if (!open) return null;

  const modal = (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4" style={{ background: "rgba(10,37,64,0.55)", backdropFilter: "blur(4px)" }} onClick={() => onOpenChange(false)}>
      <div
        className="w-full max-w-5xl max-h-[90vh] rounded-2xl overflow-hidden flex flex-col"
        style={{ background: "#FFFFFF", fontFamily: "'Montserrat', sans-serif", boxShadow: "0 24px 60px rgba(10,37,64,0.35)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 flex items-center justify-between" style={{ background: NEXO_CARD_BG, borderBottom: `1px solid ${NEXO_CYAN}33` }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: NEXO_CYAN, color: "#fff" }}>
              <Newspaper size={18} />
            </div>
            <div>
              <h3 className="text-base font-bold uppercase tracking-widest" style={{ color: NEXO_DARK }}>Notícias de Fontes</h3>
              <p className="text-[11px]" style={{ color: "rgba(10,37,64,0.65)" }}>
                {sites.length} {sites.length === 1 ? "fonte" : "fontes"} · {totalNoticias} notícias carregadas
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setShowSettings(true)} className="p-1.5 rounded-lg hover:bg-white/60 transition" style={{ color: NEXO_DARK }} title="Configurar fontes" aria-label="Configurar fontes">
              <Settings size={18} />
            </button>
            <button onClick={() => onOpenChange(false)} className="p-1.5 rounded-lg hover:bg-white/60 transition" style={{ color: NEXO_DARK }} aria-label="Fechar">
              <XIcon size={18} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        {sites.length > 0 && (
          <div className="flex items-stretch border-b" style={{ borderColor: "rgba(10,37,64,0.08)", background: "#F5FAFC" }}>
            <button
              onClick={() => scrollTabs("left")}
              disabled={!canScrollLeft}
              className="shrink-0 w-8 flex items-center justify-center transition disabled:opacity-25 hover:bg-white/70"
              style={{ color: NEXO_DARK }}
              aria-label="Rolar abas para esquerda"
              title="Anterior"
            >
              <ChevronLeft size={18} />
            </button>
            <div
              ref={tabsScrollRef}
              onScroll={updateScrollButtons}
              className="flex-1 flex items-center gap-1 py-2 overflow-x-auto scroll-smooth"
              style={{ scrollbarWidth: "none" }}
            >
              {(() => {
                const parents = sites.filter((x) => !x.parent_id);
                const orphans = sites.filter((x) => x.parent_id && !parents.some((p) => p.id === x.parent_id));
                const topLevel = [...parents, ...orphans];
                return topLevel.map((s) => {
                  const children = sites.filter((c) => c.parent_id === s.id);
                  const activeChildId = children.find((c) => c.id === activeTab)?.id;
                  const isSelfActive = s.id === activeTab;
                  const active = isSelfActive || !!activeChildId;
                  const displayLabel = activeChildId
                    ? `${s.name} › ${sites.find((c) => c.id === activeChildId)?.category || sites.find((c) => c.id === activeChildId)?.name}`
                    : s.parent_id
                      ? `${sites.find((p) => p.id === s.parent_id)?.name || "Fonte"} › ${s.category || s.name}`
                      : s.name;
                  const count = ((newsBySite[activeChildId || s.id]) || []).length;
                  const loading = loadingSite[activeChildId || s.id];
                  const isOpen = openMenuFor === s.id;
                  return (
                    <div key={s.id} ref={(el) => { tabRefs.current[s.id] = el; }} className="relative shrink-0" data-tab-id={s.id}>
                      <button
                        onClick={() => {
                          if (children.length) {
                            setOpenMenuFor((v) => (v === s.id ? null : s.id));
                          } else {
                            setActiveTab(s.id);
                            setOpenMenuFor(null);
                          }
                        }}
                        className="shrink-0 h-8 px-3 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition"
                        style={{
                          background: active ? NEXO_CYAN : "#fff",
                          color: active ? "#fff" : NEXO_DARK,
                          border: `2px solid ${active ? NEXO_CYAN : `${NEXO_CYAN}44`}`,
                        }}
                        title={children.length ? "Ver subfontes" : displayLabel}
                      >
                        <Globe size={11} />
                        <span className="truncate max-w-[200px]">{displayLabel}</span>
                        {loading ? (
                          <Loader2 size={10} className="animate-spin" />
                        ) : (
                          <span className="text-[9px] opacity-80">{count}</span>
                        )}
                        {children.length > 0 && (
                          <ChevronDown size={11} className={`transition ${isOpen ? "rotate-180" : ""}`} />
                        )}
                      </button>
                      {children.length > 0 && isOpen && menuPos && createPortal(
                        <div
                          className="fixed z-[10002] min-w-[220px] rounded-xl overflow-hidden py-1"
                          style={{ top: menuPos.top, left: menuPos.left, background: "#fff", boxShadow: "0 10px 30px rgba(10,37,64,0.18)", border: `1px solid ${NEXO_CYAN}33` }}
                          onMouseLeave={() => setOpenMenuFor(null)}
                        >
                          <button
                            onClick={() => { setActiveTab(s.id); setOpenMenuFor(null); }}
                            className="w-full text-left px-3 py-2 text-[11px] font-bold uppercase tracking-wider flex items-center gap-2 hover:bg-cyan-50 transition"
                            style={{ color: isSelfActive ? NEXO_CYAN : NEXO_DARK, background: isSelfActive ? `${NEXO_CYAN}12` : "transparent" }}
                          >
                            <Globe size={11} />
                            <span className="flex-1 truncate">Todas · {s.name}</span>
                            <span className="text-[9px] opacity-70">{(newsBySite[s.id] || []).length}</span>
                          </button>
                          <div className="h-px my-1" style={{ background: `${NEXO_CYAN}22` }} />
                          {children.map((c) => {
                            const cActive = c.id === activeTab;
                            const cCount = (newsBySite[c.id] || []).length;
                            const cLoading = loadingSite[c.id];
                            return (
                              <button
                                key={c.id}
                                onClick={() => { setActiveTab(c.id); setOpenMenuFor(null); }}
                                className="w-full text-left px-3 py-2 text-[11px] font-semibold flex items-center gap-2 hover:bg-cyan-50 transition"
                                style={{ color: cActive ? NEXO_CYAN : NEXO_DARK, background: cActive ? `${NEXO_CYAN}12` : "transparent" }}
                              >
                                <span className="text-[10px] font-black opacity-60">↳</span>
                                <span className="flex-1 truncate">{c.category || c.name}</span>
                                {cLoading ? <Loader2 size={10} className="animate-spin" /> : <span className="text-[9px] opacity-70">{cCount}</span>}
                              </button>
                            );
                          })}
                        </div>,
                        document.body
                      )}
                    </div>
                  );
                });
              })()}
            </div>
            <button
              onClick={() => scrollTabs("right")}
              disabled={!canScrollRight}
              className="shrink-0 w-8 flex items-center justify-center transition disabled:opacity-25 hover:bg-white/70 border-l"
              style={{ color: NEXO_DARK, borderColor: "rgba(10,37,64,0.06)" }}
              aria-label="Rolar abas para direita"
              title="Próxima"
            >
              <ChevronRight size={18} />
            </button>
            {activeSite && (
              <button
                onClick={() => loadSiteNews(activeSite)}
                disabled={activeLoading}
                className="shrink-0 h-8 my-2 mr-3 ml-2 px-3 rounded-full text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition hover:opacity-90 disabled:opacity-50 self-center"
                style={{ background: "#fff", color: NEXO_DARK, border: `2px solid ${NEXO_CYAN}44` }}
                title="Buscar notícias mais recentes"
              >
                <RefreshCw size={11} className={activeLoading ? "animate-spin" : ""} />
                Atualizar
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex-1 min-h-0 relative" style={{ background: "#FAFCFD" }}>
          {initialLoading && (
            <div className="flex items-center justify-center py-10 h-full" style={{ color: NEXO_DARK }}>
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}
          {!initialLoading && sites.length === 0 && (
            <div className="text-center py-16">
              <div className="w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-3" style={{ background: `${NEXO_CYAN}1A`, color: NEXO_CYAN }}>
                <Newspaper size={26} />
              </div>
              <p className="text-sm font-bold" style={{ color: NEXO_DARK }}>Nenhuma fonte cadastrada</p>
              <p className="text-xs mt-1 mb-4" style={{ color: "rgba(10,37,64,0.55)" }}>Clique no ícone de configuração para adicionar sites.</p>
              <button
                onClick={() => setShowSettings(true)}
                className="h-9 px-4 rounded-full text-[11px] font-bold uppercase tracking-wider inline-flex items-center gap-1.5"
                style={{ background: NEXO_CYAN, color: "#fff" }}
              >
                <Settings size={13} /> Configurar Fontes
              </button>
            </div>
          )}

          {!initialLoading && activeSite && (
            <>
              {activeLoading && activeNews.length === 0 ? (
                <div className="flex items-center justify-center py-10 h-full" style={{ color: NEXO_DARK }}>
                  <Loader2 size={20} className="animate-spin" />
                </div>
              ) : activeNews.length === 0 ? (
                <p className="text-xs text-center py-10" style={{ color: "rgba(10,37,64,0.55)" }}>Nenhuma notícia encontrada nesta fonte.</p>
              ) : (
                <NewsHorizontalScroller items={activeNews} siteId={activeSite.id} blocosCount={blocosCount} onDropToBloco={(bi, item) => onAddNoticiaToBloco?.(bi, item)} initialBlocoItems={initialBlocoItems} onBlocoItemsChange={onBlocoItemsChange} />
              )}
            </>
          )}
        </div>
      </div>


      {/* Settings sub-popup */}
      {showSettings && (
        <div className="fixed inset-0 z-[10001] flex items-center justify-center p-4" style={{ background: "rgba(10,37,64,0.55)", backdropFilter: "blur(4px)" }} onClick={closeSettings}>
          <div
            className="w-full max-w-lg max-h-[85vh] rounded-2xl overflow-hidden flex flex-col"
            style={{ background: "#fff", fontFamily: "'Montserrat', sans-serif", boxShadow: "0 24px 60px rgba(10,37,64,0.35)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 flex items-center justify-between" style={{ background: NEXO_CARD_BG, borderBottom: `1px solid ${NEXO_CYAN}33` }}>
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: NEXO_CYAN, color: "#fff" }}>
                  <Settings size={15} />
                </div>
                <h3 className="text-sm font-bold uppercase tracking-widest" style={{ color: NEXO_DARK }}>Configurar Fontes</h3>
              </div>
              <button onClick={closeSettings} className="p-1.5 rounded-lg hover:bg-white/60 transition" style={{ color: NEXO_DARK }} aria-label="Fechar">
                <XIcon size={16} />
              </button>
            </div>

            <div className="px-5 py-4 border-b space-y-2" style={{ borderColor: "rgba(10,37,64,0.08)" }}>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${NEXO_CYAN}1A`, color: NEXO_CYAN }}>
                  <Globe size={16} />
                </div>
                <input
                  type="text"
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addSite(); }}
                  placeholder="URL do feed RSS (ex.: https://g1.globo.com/rss/g1/)"
                  className="flex-1 h-10 px-3 rounded-lg text-xs outline-none"
                  style={{ background: "#F5FAFC", border: `2px solid ${NEXO_CYAN}33`, color: NEXO_DARK }}
                />
                <button
                  onClick={addSite}
                  disabled={adding || !newUrl.trim() || (!!newParentId && !newCategory.trim())}
                  className="h-10 px-4 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-40 transition hover:opacity-90"
                  style={{ background: NEXO_CYAN, color: "#fff" }}
                >
                  {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Adicionar
                </button>
              </div>
              <div className="flex items-center gap-2 pl-11">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addSite(); }}
                  placeholder="Nome da fonte (opcional — ex.: G1, Metrópoles)"
                  className="flex-1 h-9 px-3 rounded-lg text-[11px] outline-none"
                  style={{ background: "#F5FAFC", border: `1px solid ${NEXO_CYAN}44`, color: NEXO_DARK }}
                />

              <div className="flex items-center gap-2 pl-11">
                <select
                  value={newParentId}
                  onChange={(e) => setNewParentId(e.target.value)}
                  className="h-9 px-2 rounded-lg text-[11px] outline-none font-semibold"
                  style={{ background: "#F5FAFC", border: `1px solid ${NEXO_CYAN}44`, color: NEXO_DARK, minWidth: 160 }}
                  title="Vincular como subfonte de uma fonte principal"
                >
                  <option value="">— Fonte principal —</option>
                  {sites.filter((x) => !x.parent_id).map((p) => (
                    <option key={p.id} value={p.id}>Subfonte de: {p.name}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") addSite(); }}
                  placeholder={newParentId ? "Nome da subcategoria (ex.: Política)" : "Categoria (opcional, só p/ subfontes)"}
                  disabled={!newParentId}
                  className="flex-1 h-9 px-3 rounded-lg text-[11px] outline-none disabled:opacity-50"
                  style={{ background: "#F5FAFC", border: `1px solid ${NEXO_CYAN}44`, color: NEXO_DARK }}
                />
              </div>
              <p className="text-[10px] pl-11" style={{ color: "rgba(10,37,64,0.55)" }}>
                Dica: para adicionar só a editoria de Política do G1, escolha "Subfonte de: g1.globo.com" e nomeie a categoria "Política".
              </p>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2" style={{ background: "#FAFCFD" }}>
              {sites.length === 0 && (
                <p className="text-xs text-center py-6" style={{ color: "rgba(10,37,64,0.55)" }}>Nenhum site cadastrado ainda.</p>
              )}
              {(() => {
                const parents = sites.filter((x) => !x.parent_id);
                const orphans = sites.filter((x) => x.parent_id && !parents.some((p) => p.id === x.parent_id));
                const ordered: { site: Site; depth: number }[] = [];
                for (const p of parents) {
                  ordered.push({ site: p, depth: 0 });
                  sites.filter((c) => c.parent_id === p.id).forEach((c) => ordered.push({ site: c, depth: 1 }));
                }
                orphans.forEach((o) => ordered.push({ site: o, depth: 1 }));
                return ordered.map(({ site: s, depth }) => {
                  const isEditing = editingId === s.id;
                  return (
                    <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "#fff", border: `1px solid ${isEditing ? NEXO_CYAN : `${NEXO_CYAN}22`}`, marginLeft: depth * 20 }}>
                      {depth > 0 && <span className="text-[10px] font-bold" style={{ color: NEXO_CYAN }}>↳</span>}
                      <Globe size={14} style={{ color: NEXO_CYAN }} className="shrink-0" />
                      {isEditing ? (
                        <div className="flex-1 min-w-0 flex flex-col gap-1">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            placeholder={depth > 0 ? "Categoria (ex.: Política)" : "Nome"}
                            className="w-full h-7 px-2 rounded text-xs font-bold outline-none"
                            style={{ background: "#F5FAFC", border: `1px solid ${NEXO_CYAN}55`, color: NEXO_DARK }}
                          />
                          <input
                            type="text"
                            value={editUrl}
                            onChange={(e) => setEditUrl(e.target.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") saveEdit(s.id); if (e.key === "Escape") cancelEdit(); }}
                            placeholder="URL do feed RSS"
                            className="w-full h-7 px-2 rounded text-[10px] outline-none"
                            style={{ background: "#F5FAFC", border: `1px solid ${NEXO_CYAN}55`, color: NEXO_DARK }}
                          />
                          <select
                            value={editParentId}
                            onChange={(e) => setEditParentId(e.target.value)}
                            className="w-full h-7 px-2 rounded text-[10px] font-semibold outline-none"
                            style={{ background: "#F5FAFC", border: `1px solid ${NEXO_CYAN}55`, color: NEXO_DARK }}
                            title="Hierarquia: fonte principal ou subfonte de outra"
                          >
                            <option value="">— Fonte principal —</option>
                            {sites.filter((x) => !x.parent_id && x.id !== s.id).map((p) => (
                              <option key={p.id} value={p.id}>Subfonte de: {p.name}</option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold truncate" style={{ color: NEXO_DARK }}>
                            {depth > 0 && <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase mr-1.5" style={{ background: `${NEXO_CYAN}22`, color: NEXO_CYAN }}>SUB</span>}
                            {s.name}
                          </p>
                          <p className="text-[10px] truncate" style={{ color: "rgba(10,37,64,0.55)" }}>{s.rss_url}</p>
                        </div>
                      )}
                      {isEditing ? (
                        <>
                          <button onClick={() => saveEdit(s.id)} disabled={savingEdit} className="p-1.5 rounded-md hover:bg-cyan-50 transition disabled:opacity-50" style={{ color: NEXO_CYAN }} title="Salvar">
                            {savingEdit ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                          </button>
                          <button onClick={cancelEdit} className="p-1.5 rounded-md hover:bg-gray-100 transition" style={{ color: NEXO_DARK }} title="Cancelar">
                            <XIcon size={13} />
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(s)} className="p-1.5 rounded-md hover:bg-cyan-50 transition" style={{ color: NEXO_DARK }} title="Editar">
                            <Pencil size={13} />
                          </button>
                          <button onClick={() => removeSite(s.id)} className="p-1.5 rounded-md hover:bg-red-50 transition" style={{ color: "#dc2626" }} title="Remover">
                            <Trash2 size={13} />
                          </button>
                        </>
                      )}
                    </div>
                  );
                });
              })()}
            </div>

            <div className="px-5 py-3 border-t flex justify-end" style={{ borderColor: "rgba(10,37,64,0.08)" }}>
              <button
                onClick={closeSettings}
                className="h-9 px-5 rounded-full text-[11px] font-bold uppercase tracking-wider transition hover:opacity-90"
                style={{ background: NEXO_DARK, color: "#fff" }}
              >
                Concluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(modal, document.body);
}
