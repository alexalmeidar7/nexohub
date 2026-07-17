// Refreshes cached news items for every custom_news_sites row.
// Called by pg_cron every 5 minutes. Also invokable manually.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type NewsItem = { title: string; link: string; thumbnail: string; pubDate: string };

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

function parseRss(xml: string): NewsItem[] {
  const results: NewsItem[] = [];
  const blocks = xml.match(/<(item|entry)[\s>][\s\S]*?<\/(item|entry)>/gi) || [];
  for (const block of blocks) {
    let rawTitle = decodeHtmlEntities(pickTag(block, "title"));
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
    if (!thumbnail) {
      const desc = pickTag(block, "description") || pickTag(block, "content:encoded") || pickTag(block, "summary");
      const im = desc.match(/<img[^>]+src=["']([^"']+)["']/i);
      if (im) thumbnail = im[1];
    }

    results.push({ title, link, thumbnail, pubDate });
    if (results.length >= 20) break;
  }
  return results;
}

async function fetchXml(url: string): Promise<string> {
  const timeouts = [8000, 12000];
  let lastErr: unknown = null;
  for (const t of timeouts) {
    try {
      const fresh = new URL(url);
      fresh.searchParams.set("_lvcb", Date.now().toString());
      const res = await fetch(fresh.toString(), {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; NexoHubRSSBot/1.0)",
          "Accept": "application/rss+xml, application/xml, text/xml, */*",
        },
        signal: AbortSignal.timeout(t),
      });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        if (res.status >= 400 && res.status < 500) break;
        continue;
      }
      return await res.text();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("fetch failed");
}

async function refreshSite(admin: any, site: { id: string; user_id: string; rss_url: string }) {
  try {
    const xml = await fetchXml(site.rss_url);
    const items = parseRss(xml);
    await admin.from("news_cache").upsert({
      site_id: site.id,
      user_id: site.user_id,
      items,
      updated_at: new Date().toISOString(),
      last_error: null,
    });
    return { site_id: site.id, ok: true, count: items.length };
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
