import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Newspaper, Plus, Trash2, Loader2, X as XIcon, RefreshCw, ExternalLink, Globe, Settings, Pencil, Check, ChevronLeft, ChevronRight, Eye } from "lucide-react";

const NEXO_CYAN = "#00BFF0";
const NEXO_CARD_BG = "#D6F4FB";
const NEXO_DARK = "#0A2540";

const PROXY = "https://api.allorigins.win/raw?url=";

type NewsItem = { title: string; link: string; thumbnail: string; pubDate: string };
type Site = { id: string; name: string; rss_url: string };

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

function NewsHorizontalScroller({ items, siteId }: { items: NewsItem[]; siteId: string }) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const dirRef = useRef<0 | 1 | -1>(0);
  const speedRef = useRef(0);

  // Reset scroll when switching site
  useEffect(() => {
    if (scrollerRef.current) scrollerRef.current.scrollLeft = 0;
  }, [siteId]);

  const tick = () => {
    const el = scrollerRef.current;
    if (el && dirRef.current !== 0) {
      el.scrollLeft += dirRef.current * speedRef.current;
    }
    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = scrollerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const zone = Math.min(180, rect.width * 0.18);
    if (x < zone) {
      const intensity = 1 - x / zone; // 0..1
      dirRef.current = -1;
      speedRef.current = 3 + intensity * 18;
    } else if (x > rect.width - zone) {
      const intensity = 1 - (rect.width - x) / zone;
      dirRef.current = 1;
      speedRef.current = 3 + intensity * 18;
    } else {
      dirRef.current = 0;
      speedRef.current = 0;
    }
  };

  const onMouseLeave = () => {
    dirRef.current = 0;
    speedRef.current = 0;
  };

  const nudge = (dir: -1 | 1) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.min(600, el.clientWidth * 0.8), behavior: "smooth" });
  };

  return (
    <div className="relative h-full w-full" onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
      {/* Edge hint gradients */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 z-10" style={{ background: "linear-gradient(to right, #FAFCFD, rgba(250,252,253,0))" }} />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 z-10" style={{ background: "linear-gradient(to left, #FAFCFD, rgba(250,252,253,0))" }} />

      {/* Nudge arrows */}
      <button
        onClick={() => nudge(-1)}
        className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition"
        style={{ background: "#fff", color: NEXO_DARK, border: `1px solid ${NEXO_CYAN}44` }}
        aria-label="Anterior"
      >
        <ChevronLeft size={18} />
      </button>
      <button
        onClick={() => nudge(1)}
        className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition"
        style={{ background: "#fff", color: NEXO_DARK, border: `1px solid ${NEXO_CYAN}44` }}
        aria-label="Próximo"
      >
        <ChevronRight size={18} />
      </button>

      <div
        ref={scrollerRef}
        className="h-full w-full overflow-x-auto overflow-y-hidden flex items-stretch gap-4 px-8 py-6 scroll-smooth"
        style={{ scrollbarWidth: "thin" }}
      >
        {items.map((n, i) => {
          const dateLabel = formatPubDate(n.pubDate);
          return (
            <a
              key={`${siteId}-${i}`}
              href={n.link}
              target="_blank"
              rel="noopener noreferrer"
              className="group shrink-0 rounded-2xl overflow-hidden flex flex-col hover:-translate-y-1 transition"
              style={{
                width: 280,
                background: NEXO_CARD_BG,
                boxShadow: "0 6px 18px rgba(10,37,64,0.10)",
                fontFamily: "'Montserrat', sans-serif",
              }}
            >
              <div className="w-full overflow-hidden" style={{ background: `${NEXO_DARK}0A`, aspectRatio: "4/3" }}>
                {n.thumbnail ? (
                  <img src={n.thumbnail} alt="" className="w-full h-full object-cover group-hover:scale-105 transition" loading="lazy" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center" style={{ color: `${NEXO_DARK}55` }}>
                    <Newspaper size={38} />
                  </div>
                )}
              </div>
              <div className="flex-1 flex flex-col p-5 gap-4">
                <h3
                  className="text-[17px] leading-[1.15] font-black line-clamp-5"
                  style={{ color: NEXO_DARK, letterSpacing: "-0.01em" }}
                >
                  {n.title}
                </h3>
                <div className="mt-auto flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold" style={{ color: NEXO_DARK, opacity: 0.75 }}>
                    {dateLabel || " "}
                  </span>
                  <span
                    className="w-9 h-9 rounded-full flex items-center justify-center transition group-hover:scale-110"
                    style={{ background: NEXO_CYAN, color: "#fff" }}
                    aria-label="Abrir notícia"
                  >
                    <Eye size={16} />
                  </span>
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}


export default function NoticiasFontesPopup({ open, onOpenChange }: Props) {
  const { user } = useAuth();
  const [sites, setSites] = useState<Site[]>([]);
  const [newsBySite, setNewsBySite] = useState<Record<string, NewsItem[]>>({});
  const [loadingSite, setLoadingSite] = useState<Record<string, boolean>>({});
  const [newUrl, setNewUrl] = useState("");
  const [adding, setAdding] = useState(false);
  const [initialLoading, setInitialLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editUrl, setEditUrl] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const tabsScrollRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

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
    const { data } = await supabase.from("custom_news_sites").select("id,name,rss_url").eq("user_id", user.id).order("created_at", { ascending: true });
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
    let displayName = url;
    try { displayName = new URL(url).hostname.replace(/^www\./, ""); } catch {}
    const { data, error } = await supabase.from("custom_news_sites").insert({ user_id: user.id, name: displayName, rss_url: url }).select("id,name,rss_url").single();
    setAdding(false);
    if (error || !data) return;
    setNewUrl("");
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
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditUrl("");
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim() || !editUrl.trim()) return;
    setSavingEdit(true);
    let url = editUrl.trim();
    if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
    const name = editName.trim();
    const { error } = await supabase.from("custom_news_sites").update({ name, rss_url: url }).eq("id", id);
    setSavingEdit(false);
    if (error) return;
    const updated: Site = { id, name, rss_url: url };
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
              {sites.map((s) => {
                const active = s.id === activeTab;
                const count = (newsBySite[s.id] || []).length;
                const loading = loadingSite[s.id];
                return (
                  <button
                    key={s.id}
                    data-tab-id={s.id}
                    onClick={() => setActiveTab(s.id)}
                    className="shrink-0 h-8 px-3 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 transition"
                    style={{
                      background: active ? NEXO_CYAN : "#fff",
                      color: active ? "#fff" : NEXO_DARK,
                      border: `2px solid ${active ? NEXO_CYAN : `${NEXO_CYAN}44`}`,
                    }}
                  >
                    <Globe size={11} />
                    <span className="truncate max-w-[140px]">{s.name}</span>
                    {loading ? (
                      <Loader2 size={10} className="animate-spin" />
                    ) : (
                      <span className="text-[9px] opacity-80">{count}</span>
                    )}
                  </button>
                );
              })}
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
                <NewsHorizontalScroller items={activeNews} siteId={activeSite.id} />
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

            <div className="px-5 py-4 flex items-center gap-2 border-b" style={{ borderColor: "rgba(10,37,64,0.08)" }}>
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
                disabled={adding || !newUrl.trim()}
                className="h-10 px-4 rounded-full text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 disabled:opacity-40 transition hover:opacity-90"
                style={{ background: NEXO_CYAN, color: "#fff" }}
              >
                {adding ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />} Adicionar
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-2" style={{ background: "#FAFCFD" }}>
              {sites.length === 0 && (
                <p className="text-xs text-center py-6" style={{ color: "rgba(10,37,64,0.55)" }}>Nenhum site cadastrado ainda.</p>
              )}
              {sites.map((s) => {
                const isEditing = editingId === s.id;
                return (
                  <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: "#fff", border: `1px solid ${isEditing ? NEXO_CYAN : `${NEXO_CYAN}22`}` }}>
                    <Globe size={14} style={{ color: NEXO_CYAN }} className="shrink-0" />
                    {isEditing ? (
                      <div className="flex-1 min-w-0 flex flex-col gap-1">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          placeholder="Nome"
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
                      </div>
                    ) : (
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold truncate" style={{ color: NEXO_DARK }}>{s.name}</p>
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
              })}
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
