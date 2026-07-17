// Refreshes cached news items for every custom_news_sites row.
// Called by pg_cron every 5 minutes. Also invokable manually.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type NewsItem = { title: string; link: string; thumbnail: string; pubDate: string; summary?: string };

function decodeHtmlEntities(text: string): string {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(parseInt(d, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
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

function sanitizeTitle(t: string): string {
  return (t || "").replace(/\uFFFD/g, "").replace(/\s+/g, " ").trim();
}



function parseRss(xml: string): NewsItem[] {
  const results: NewsItem[] = [];
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi) || [];
  for (const block of blocks) {
    let rawTitle = sanitizeTitle(decodeHtmlEntities(pickTag(block, "title")));
    let title = rawTitle.includes("|") ? rawTitle.split("|")[0].trim() : rawTitle;
    if (title.includes(" - ")) title = title.split(" - ")[0].trim();
    if (!title) continue;

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
    const descRaw = pickTag(block, "description") || pickTag(block, "content:encoded") || pickTag(block, "summary");
    if (!thumbnail && descRaw) {
      const im = descRaw.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (im) thumbnail = im[1];
    }
    const summary = sanitizeTitle(decodeHtmlEntities(descRaw.replace(/<[^>]+>/g, " "))).slice(0, 320);

    results.push({ title, link, thumbnail, pubDate, summary });
    if (results.length >= 20) break;
  }
  return results;
}

function decodeBytes(buf: ArrayBuffer, contentType: string): string {
  // Detect charset from Content-Type header or from meta/xml declaration
  let charset = "";
  const ctMatch = contentType.match(/charset=([^;]+)/i);
  if (ctMatch) charset = ctMatch[1].trim().toLowerCase();
  if (!charset) {
    const head = new TextDecoder("utf-8").decode(buf.slice(0, 2048));
    const xmlEnc = head.match(/<\?xml[^>]+encoding=["']([^"']+)["']/i);
    const metaEnc = head.match(/<meta[^>]+charset=["']?([\w-]+)/i);
    if (xmlEnc) charset = xmlEnc[1].toLowerCase();
    else if (metaEnc) charset = metaEnc[1].toLowerCase();
  }
  // Normalize common aliases
  if (charset === "iso-8859-1" || charset === "latin1" || charset === "iso8859-1") charset = "windows-1252";
  try {
    return new TextDecoder(charset || "utf-8", { fatal: false }).decode(buf);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(buf);
  }
}

async function fetchXml(url: string): Promise<{ text: string; status: number }> {
  const timeouts = [10000, 15000];
  let lastErr: unknown = null;
  for (const t of timeouts) {
    try {
      const fresh = new URL(url);
      fresh.searchParams.set("_lvcb", Date.now().toString());
      const res = await fetch(fresh.toString(), {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
          "Accept": "application/rss+xml, application/xml, text/xml, text/html, */*",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(t),
      });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        if (res.status >= 400 && res.status < 500) return { text: "", status: res.status };
        continue;
      }
      const ct = res.headers.get("content-type") || "";
      const buf = await res.arrayBuffer();
      return { text: decodeBytes(buf, ct), status: res.status };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("fetch failed");
}


// Parse Google News sitemap: <urlset><url><loc/><news:title/><image:loc/></url></urlset>
function parseNewsSitemap(xml: string): NewsItem[] {
  const results: NewsItem[] = [];
  const urls = xml.match(/<url\b[\s\S]*?<\/url>/gi) || [];
  for (const u of urls) {
    const loc = pickTag(u, "loc").trim();
    const title = sanitizeTitle(decodeHtmlEntities(pickTag(u, "news:title") || pickTag(u, "title")));
    if (!loc || !title) continue;
    let thumbnail = "";
    const im = u.match(/<image:loc>([\s\S]*?)<\/image:loc>/i);
    if (im) thumbnail = im[1].trim();
    const pubDate = pickTag(u, "news:publication_date") || pickTag(u, "lastmod") || "";
    results.push({ title, link: loc, thumbnail, pubDate });
    if (results.length >= 20) break;
  }
  return results;
}

function parseHtmlNews(html: string, baseUrl: string): NewsItem[] {
  const results: NewsItem[] = [];
  const seen = new Set<string>();
  let baseOrigin = "";
  try { baseOrigin = new URL(baseUrl).origin; } catch {}

  // Encontra <a href=...>...</a> com heading interno ou aria-label
  const anchorRe = /<a\b([^>]*?)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = anchorRe.exec(html)) !== null) {
    const attrsBefore = m[1] || "";
    const href = m[2] || "";
    const attrsAfter = m[3] || "";
    const inner = m[4] || "";
    if (!href || href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:")) continue;

    let link = href;
    try { link = new URL(href, baseUrl).toString(); } catch { continue; }
    if (baseOrigin && !link.startsWith(baseOrigin)) continue;
    try {
      const u = new URL(link);
      if (u.pathname === "/" || u.pathname.length < 8) continue;
    } catch {}
    if (seen.has(link)) continue;

    // Extrai título: heading interno, aria-label ou texto puro
    let title = "";
    const hMatch = inner.match(/<h[1-5][^>]*>([\s\S]*?)<\/h[1-5]>/i);
    if (hMatch) title = hMatch[1];
    if (!title) {
      const attrs = attrsBefore + " " + attrsAfter;
      const al = attrs.match(/aria-label=["']([^"']+)["']/i) || attrs.match(/\btitle=["']([^"']+)["']/i);
      if (al) title = al[1];
    }
    if (!title) title = inner;
    title = sanitizeTitle(decodeHtmlEntities(title.replace(/<[^>]+>/g, " ")));
    if (!title || title.length < 20 || title.length > 220) continue;
    if (title.includes("|")) title = title.split("|")[0].trim();

    // Imagem interna, se houver
    let thumbnail = "";
    const imgMatch = inner.match(/<img[^>]+(?:src|data-src|data-lazy-src)=["']([^"']+)["']/i);
    if (imgMatch) {
      try { thumbnail = new URL(imgMatch[1], baseUrl).toString(); } catch {}
    }

    seen.add(link);
    results.push({ title, link, thumbnail, pubDate: "" });
    if (results.length >= 15) break;
  }
  return results;
}

const CANDIDATE_PATHS = ["/feed/", "/feed", "/rss/", "/rss", "/rss.xml", "/index.xml", "/dynamo/rss2.xml", "/feed/rss/", "/atom.xml"];
const SITEMAP_NEWS_PATHS = ["/sitemap/hoje.xml", "/sitemap-news.xml", "/news-sitemap.xml", "/sitemap_news.xml", "/google-news-sitemap.xml"];

async function tryParseAny(text: string, baseUrl: string): Promise<NewsItem[]> {
  // Google News sitemap first (has news:title + image:loc)
  if (/<urlset[\s\S]*xmlns:news=/i.test(text) || /<news:title>/i.test(text)) {
    const items = parseNewsSitemap(text);
    if (items.length) return items;
  }
  const rss = parseRss(text);
  if (rss.length) return rss;
  return parseHtmlNews(text, baseUrl);
}

async function discoverAndParse(rssUrl: string): Promise<{ items: NewsItem[]; note?: string }> {
  // 1) URL original
  try {
    const { text, status } = await fetchXml(rssUrl);
    if (text) {
      if (/<urlset[\s\S]*xmlns:news=/i.test(text) || /<news:title>/i.test(text)) {
        const items = parseNewsSitemap(text);
        if (items.length) return { items, note: "news-sitemap" };
      }
      const items = parseRss(text);
      if (items.length) return { items };
      const html = parseHtmlNews(text, rssUrl);
      if (html.length) return { items: html, note: "html-scrape" };
    } else if (status && status >= 400 && status < 500) {
      // 404/410 → auto-discovery
    }
  } catch (_e) { /* segue */ }

  // 2) Auto-discovery de feeds RSS
  let base: URL | null = null;
  try { base = new URL(rssUrl); } catch { return { items: [] }; }
  const current = base.pathname.replace(/\/$/, "");

  for (const path of CANDIDATE_PATHS) {
    if (current === path.replace(/\/$/, "")) continue;
    try {
      const { text } = await fetchXml(`${base.origin}${path}`);
      if (!text) continue;
      const items = parseRss(text);
      if (items.length) return { items, note: `discovered:${path}` };
    } catch {}
  }

  // 3) Sitemap Google News (ex.: O Popular /sitemap/hoje.xml)
  for (const path of SITEMAP_NEWS_PATHS) {
    try {
      const { text } = await fetchXml(`${base.origin}${path}`);
      if (!text) continue;
      const items = parseNewsSitemap(text);
      if (items.length) return { items, note: `news-sitemap:${path}` };
    } catch {}
  }

  // 4) sitemap.xml → seguir primeiro sitemap-news dentro
  try {
    const { text } = await fetchXml(`${base.origin}/sitemap.xml`);
    if (text) {
      const locs = Array.from(text.matchAll(/<loc>([^<]+)<\/loc>/gi)).map((m) => m[1].trim());
      const newsLoc = locs.find((l) => /news|hoje/i.test(l)) || locs[0];
      if (newsLoc) {
        const sub = await fetchXml(newsLoc);
        if (sub.text) {
          const items = parseNewsSitemap(sub.text);
          if (items.length) return { items, note: `sitemap-index:${newsLoc}` };
        }
      }
    }
  } catch {}

  // 5) Última tentativa: raiz do domínio como HTML
  try {
    const { text } = await fetchXml(base.origin + "/");
    if (text) {
      const html = parseHtmlNews(text, base.origin + "/");
      if (html.length) return { items: html, note: "root-html-scrape" };
    }
  } catch {}

  return { items: [] };
}

async function refreshSite(admin: any, site: { id: string; user_id: string; rss_url: string }) {
  try {
    const { items, note } = await discoverAndParse(site.rss_url);
    await admin.from("news_cache").upsert({
      site_id: site.id,
      user_id: site.user_id,
      items,
      updated_at: new Date().toISOString(),
      last_error: items.length ? null : "sem-items",
    });
    return { site_id: site.id, ok: items.length > 0, count: items.length, note };
  } catch (e: any) {
    await admin.from("news_cache").upsert({
      site_id: site.id,
      user_id: site.user_id,
      items: [],
      updated_at: new Date().toISOString(),
      last_error: e?.message?.slice(0, 500) || "erro",
    });
    return { site_id: site.id, ok: false, error: e?.message };
  }
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    let target: string | null = null;
    if (req.method === "POST") {
      try {
        const body = await req.json();
        target = body?.site_id || body?.user_id || null;
      } catch {}
    }

    let query = admin.from("custom_news_sites").select("id,user_id,rss_url");
    if (target && target.length === 36) {
      // could be either — try site_id first
      const { data: byId } = await admin.from("custom_news_sites").select("id,user_id,rss_url").eq("id", target);
      if (byId && byId.length) {
        const results = await Promise.all(byId.map((s: any) => refreshSite(admin, s)));
        return new Response(JSON.stringify({ ok: true, results }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      query = query.eq("user_id", target);
    }

    const { data: sites, error } = await query;
    if (error) throw error;

    const list = (sites as any[]) || [];
    // parallel batches of 4
    const results: any[] = [];
    const CONCURRENCY = 4;
    let i = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, list.length) }, async () => {
      while (i < list.length) {
        const idx = i++;
        results.push(await refreshSite(admin, list[idx]));
      }
    });
    await Promise.all(workers);

    return new Response(JSON.stringify({ ok: true, total: list.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("[refresh-news-cache] error", e);
    return new Response(JSON.stringify({ ok: false, error: e?.message || String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
