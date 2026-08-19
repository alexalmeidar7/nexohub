// Counts current viewers for a user's active video streams.
// Fastest-wins strategy: runs XPath override (if set), generic viewer-tag
// auto-detect, HLS m3u8 EXT-X-VIEWERS scan, nginx-rtmp /stat and
// provider-specific probes (YouTube Live "watching now") in parallel.
import { nginxRtmpStatViewers } from "../_shared/streamAdmin.ts";

const corsHeaders = {

  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const HDR = { "User-Agent": "Mozilla/5.0" };
const T = 6000;

function extractByPath(text: string, rawPath: string): number | null {
  const path = rawPath.replace(/^\/+/, "").split(/[\/.]/).map(s => s.trim()).filter(Boolean);
  if (!path.length) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      let cur: any = JSON.parse(trimmed);
      for (const key of path) {
        if (cur == null) return null;
        if (Array.isArray(cur)) cur = cur[0];
        cur = cur?.[key];
      }
      if (Array.isArray(cur)) cur = cur[0];
      const n = typeof cur === "string" ? parseInt(cur, 10) : Number(cur);
      return Number.isFinite(n) ? n : null;
    } catch { /* fall to XML */ }
  }
  let scope = trimmed;
  for (const tag of path) {
    const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
    const m = scope.match(re);
    if (!m) return null;
    scope = m[1];
  }
  const inner = scope.replace(/<[^>]+>/g, "").trim();
  const n = parseInt(inner, 10);
  return Number.isFinite(n) ? n : null;
}

// Common tags used by Wowza / JW / Nimble / Ant / Flussonic / IceStreamer / etc.
const VIEWER_TAGS = [
  "viewers", "currentviewers", "current_viewers",
  "concurrent_viewers", "concurrentviewers",
  "watching", "watchingnow", "watching_now",
  "espectadores", "espectadores_conectados",
  "clients", "activeclients",
];

function autoDetectViewers(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const j = JSON.parse(trimmed);
      const walk = (node: any): number | null => {
        if (node == null) return null;
        if (Array.isArray(node)) {
          for (const it of node) { const v = walk(it); if (v != null) return v; }
          return null;
        }
        if (typeof node === "object") {
          for (const [k, v] of Object.entries(node)) {
            if (VIEWER_TAGS.includes(k.toLowerCase())) {
              const n = typeof v === "string" ? parseInt(v, 10) : Number(v);
              if (Number.isFinite(n)) return n;
            }
          }
          for (const v of Object.values(node)) { const r = walk(v); if (r != null) return r; }
        }
        return null;
      };
      const n = walk(j); if (n != null) return n;
    } catch { /* fall through */ }
  }
  for (const tag of VIEWER_TAGS) {
    const re = new RegExp(`<${tag}[^>]*>\\s*(\\d+)\\s*<\\/${tag}>`, "i");
    const m = trimmed.match(re); if (m) return parseInt(m[1], 10);
  }
  // HLS manifest hint (some providers add #EXT-X-VIEWERS:N)
  const hls = trimmed.match(/#EXT-X-VIEWERS:\s*(\d+)/i);
  if (hls) return parseInt(hls[1], 10);
  return null;
}

async function fetchWithXPath(url: string, xpath: string): Promise<number | null> {
  try {
    const r = await fetch(url, { headers: HDR, signal: AbortSignal.timeout(T) });
    if (!r.ok) return null;
    return extractByPath(await r.text(), xpath);
  } catch { return null; }
}

async function fetchGenericViewers(url: string): Promise<number | null> {
  try {
    const r = await fetch(url, { headers: HDR, signal: AbortSignal.timeout(T) });
    if (!r.ok) return null;
    return autoDetectViewers(await r.text());
  } catch { return null; }
}

function extractYouTubeId(input: string): string | null {
  try {
    const u = new URL(input);
    if (u.hostname.includes("youtu.be")) return u.pathname.replace(/^\//, "").split(/[/?#]/)[0] || null;
    if (u.hostname.includes("youtube.com")) {
      const v = u.searchParams.get("v"); if (v) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      const li = parts.indexOf("live"); if (li >= 0 && parts[li + 1]) return parts[li + 1];
      const ei = parts.indexOf("embed"); if (ei >= 0 && parts[ei + 1]) return parts[ei + 1];
    }
  } catch { /* not a URL */ }
  const m = input.match(/[?&/]v[=/]([\w-]{11})/) || input.match(/^([\w-]{11})$/);
  return m ? m[1] : null;
}

async function fetchYouTubeLiveViewers(url: string): Promise<number | null> {
  const id = extractYouTubeId(url);
  if (!id) return null;
  try {
    const r = await fetch(`https://www.youtube.com/watch?v=${id}&hl=en`, {
      headers: { ...HDR, "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(T),
    });
    if (!r.ok) return null;
    const t = await r.text();
    // Multiple hints appear in the HTML — try each fast regex.
    const patterns = [
      /"viewCount":\s*{\s*"videoViewCountRenderer":\s*{\s*"viewCount":\s*{\s*"runs":\s*\[\s*{\s*"text":\s*"([\d.,\s]+)"/,
      /"concurrentViewers":\s*"(\d+)"/,
      /"videoViewCountRenderer".*?"viewCount":\s*"([\d.,\s]+)"/,
      /(\d[\d.,\s]*)\s+watching now/i,
    ];
    for (const re of patterns) {
      const m = t.match(re);
      if (m) {
        const n = parseInt(m[1].replace(/[^\d]/g, ""), 10);
        if (Number.isFinite(n)) return n;
      }
    }
    return null;
  } catch { return null; }
}

// --- YouTube Data API v3 -------------------------------------------------
// Given a channel URL (or @handle / channel id) and an API key, resolves the
// current live broadcast and returns concurrent viewers.
function parseYouTubeChannel(input: string): { channelId?: string; handle?: string; username?: string } {
  try {
    const u = new URL(input.startsWith("http") ? input : `https://youtube.com/${input.replace(/^\/+/, "")}`);
    const parts = u.pathname.split("/").filter(Boolean);
    if (parts[0]?.startsWith("@")) return { handle: parts[0].slice(1) };
    const ci = parts.indexOf("channel");
    if (ci >= 0 && parts[ci + 1]) return { channelId: parts[ci + 1] };
    const ui = parts.indexOf("user");
    if (ui >= 0 && parts[ui + 1]) return { username: parts[ui + 1] };
    const ci2 = parts.indexOf("c");
    if (ci2 >= 0 && parts[ci2 + 1]) return { username: parts[ci2 + 1] };
  } catch { /* not a URL */ }
  if (input.startsWith("@")) return { handle: input.slice(1) };
  if (/^UC[\w-]{20,}$/.test(input)) return { channelId: input };
  return {};
}

async function resolveYouTubeChannelId(ref: { channelId?: string; handle?: string; username?: string }, apiKey: string): Promise<string | null> {
  if (ref.channelId) return ref.channelId;
  const p = new URLSearchParams({ part: "id", key: apiKey });
  if (ref.handle) p.set("forHandle", `@${ref.handle}`);
  else if (ref.username) p.set("forUsername", ref.username);
  else return null;
  try {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/channels?${p.toString()}`, { signal: AbortSignal.timeout(T) });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.items?.[0]?.id || null;
  } catch { return null; }
}

// Fallback: scrape the channel's /live page directly. The YouTube Data API
// search endpoint has several-minute indexing lag for eventType=live, so it
// often reports "no live" while a broadcast is actively running. The public
// /channel/<id>/live URL redirects to the current live video and exposes the
// concurrent viewer count in the HTML.
async function fetchYouTubeChannelLiveScrape(channelId: string): Promise<number | null> {
  try {
    const r = await fetch(`https://www.youtube.com/channel/${channelId}/live?hl=en`, {
      headers: { ...HDR, "Accept-Language": "en-US,en;q=0.9" },
      signal: AbortSignal.timeout(T),
    });
    if (!r.ok) return null;
    const t = await r.text();
    const patterns = [
      /"concurrentViewers":\s*"(\d+)"/,
      /"viewCount":\s*{\s*"videoViewCountRenderer":\s*{\s*"viewCount":\s*{\s*"runs":\s*\[\s*{\s*"text":\s*"([\d.,\s]+)"/,
      /(\d[\d.,\s]*)\s+watching now/i,
    ];
    for (const re of patterns) {
      const m = t.match(re);
      if (m) {
        const n = parseInt(m[1].replace(/[^\d]/g, ""), 10);
        if (Number.isFinite(n)) return n;
      }
    }
    // No live indicators found on the page — channel is not live.
    return 0;
  } catch { return null; }
}

async function fetchYouTubeApiLiveViewers(channelUrl: string, apiKey: string): Promise<number | null> {
  const ref = parseYouTubeChannel(channelUrl);
  const channelId = await resolveYouTubeChannelId(ref, apiKey);
  if (!channelId) return null;
  try {
    // Find current live broadcast for this channel.
    const searchP = new URLSearchParams({
      part: "id", channelId, eventType: "live", type: "video", maxResults: "1", key: apiKey,
    });
    const sr = await fetch(`https://www.googleapis.com/youtube/v3/search?${searchP.toString()}`, { signal: AbortSignal.timeout(T) });
    if (sr.ok) {
      const sj = await sr.json();
      const videoId: string | undefined = sj?.items?.[0]?.id?.videoId;
      if (videoId) {
        const vp = new URLSearchParams({ part: "liveStreamingDetails", id: videoId, key: apiKey });
        const vr = await fetch(`https://www.googleapis.com/youtube/v3/videos?${vp.toString()}`, { signal: AbortSignal.timeout(T) });
        if (vr.ok) {
          const vj = await vr.json();
          const n = parseInt(vj?.items?.[0]?.liveStreamingDetails?.concurrentViewers || "0", 10);
          if (Number.isFinite(n) && n > 0) return n;
        }
      }
    }
    // API said "no live" (or quota/error) — confirm with an HTML scrape which
    // reflects reality without indexing lag.
    const scraped = await fetchYouTubeChannelLiveScrape(channelId);
    return scraped;
  } catch {
    // Last-ditch scrape if the API call itself threw.
    return await fetchYouTubeChannelLiveScrape(channelId);
  }
}

async function fetchProviderViewers(streamUrl: string): Promise<number | null> {
  // YouTube live is by far the most common. Add more provider probes here.
  if (/youtu\.?be/i.test(streamUrl)) return fetchYouTubeLiveViewers(streamUrl);
  return null;
}

async function raceStrategies(url: string, xpath: string | null): Promise<number | null> {
  const strategies: Array<Promise<number | null>> = [];
  if (xpath) strategies.push(fetchWithXPath(url, xpath));
  strategies.push(fetchGenericViewers(url));
  strategies.push(fetchProviderViewers(url));
  // nginx-rtmp / http-flv /stat (optionally authenticated via backend secret).
  strategies.push(nginxRtmpStatViewers(url).catch(() => null));

  try {
    return await Promise.any(
      strategies.map(async (p) => {
        const v = await p; if (v === null) throw new Error("null"); return v;
      }),
    );
  } catch { return null; }
}

// ---- Cache layer ---------------------------------------------------------
// TTL cache + in-flight dedupe. Keyed by URL+xpath. Shared across warm invocations.
const CACHE_TTL_MS = 20_000;
// Hard deadline so a stalled probe (or an in-flight promise inherited from a
// frozen isolate) can never hold the request open until the 150s idle timeout.
const HARD_DEADLINE_MS = 12_000;
const cache = new Map<string, { value: number | null; expires: number }>();
const inflight = new Map<string, { promise: Promise<number | null>; startedAt: number }>();

function withDeadline(p: Promise<number | null>, ms = HARD_DEADLINE_MS): Promise<number | null> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(null), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, () => { clearTimeout(t); resolve(null); });
  });
}

async function resolveCached(url: string, xpath: string | null): Promise<number | null> {
  const key = `${url}\u0000${xpath ?? ""}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.value;
  const pending = inflight.get(key);
  // Only reuse a fresh in-flight probe; stale ones may never settle.
  if (pending && now - pending.startedAt < HARD_DEADLINE_MS) {
    return withDeadline(pending.promise);
  }
  const p = (async () => {
    try {
      const value = await raceStrategies(url, xpath);
      cache.set(key, { value, expires: Date.now() + (value == null ? 5_000 : CACHE_TTL_MS) });
      return value;
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, { promise: p, startedAt: now });
  return withDeadline(p);
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const userId = typeof body?.userId === "string" && body.userId.trim() ? body.userId.trim() : null;
    const xpath = typeof body?.xpath === "string" && body.xpath.trim() ? body.xpath.trim() : null;
    const debug: string[] = [];

    let urls: string[] = [];
    let ytChannelUrl: string | null = typeof body?.youtubeUrl === "string" ? body.youtubeUrl.trim() : null;
    let ytApiKey: string | null = typeof body?.youtubeApiKey === "string" ? body.youtubeApiKey.trim() : null;
    let ytChannelId: string | null = typeof body?.youtubeChannelId === "string" ? body.youtubeChannelId.trim() : null;

    if (Array.isArray(body?.urls)) {
      urls = body.urls.filter((u: unknown) => typeof u === "string" && u);
    } else if (userId) {
      const supaUrl = Deno.env.get("SUPABASE_URL");
      const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supaUrl && svcKey) {
        const [chRes, cfgRes] = await Promise.all([
          fetch(
            `${supaUrl}/rest/v1/streaming_channels?user_id=eq.${userId}&type=eq.video_live&active=eq.true&select=url`,
            { headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` } },
          ),
          fetch(
            `${supaUrl}/rest/v1/empresa_config?user_id=eq.${userId}&select=youtube,youtube_api_key,youtube_channel_id`,
            { headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` } },
          ),
        ]);
        if (chRes.ok) {
          const rows = await chRes.json();
          urls = (Array.isArray(rows) ? rows : []).map((x: any) => x.url).filter(Boolean);
          debug.push(`channels=${urls.length}`);
        } else {
          debug.push(`lookup http=${chRes.status}`);
        }
        if (cfgRes.ok) {
          const rows = await cfgRes.json();
          const cfg = Array.isArray(rows) ? rows[0] : null;
          if (!ytChannelUrl && cfg?.youtube) ytChannelUrl = cfg.youtube;
          if (!ytApiKey && cfg?.youtube_api_key) ytApiKey = cfg.youtube_api_key;
          if (!ytChannelId && cfg?.youtube_channel_id) ytChannelId = cfg.youtube_channel_id;
        }
      }
    }

    const counts = await Promise.all(urls.map((u) => resolveCached(u, xpath)));
    urls.forEach((u, i) => debug.push(`${u} -> ${counts[i]}`));

    // YouTube Live via official Data API or direct channel lookup.
    let ytLive: number | null = null;
    if (ytChannelId || ytChannelUrl) {
      if (ytApiKey) {
        const ref = ytChannelId ? ytChannelId : ytChannelUrl!;
        ytLive = await withDeadline(fetchYouTubeApiLiveViewers(ref, ytApiKey));
        debug.push(`youtube_api ${ref} -> ${ytLive}`);
      } else if (ytChannelId) {
        // ID-only fallback (scrape-based) when no API key is provided
        ytLive = await withDeadline(fetchYouTubeChannelLiveScrape(ytChannelId));
        debug.push(`youtube_scrape ${ytChannelId} -> ${ytLive}`);
      }

    }

    const streamTotal = counts.reduce((a, n) => a + (n ?? 0), 0);
    const total = streamTotal + (ytLive ?? 0);
    const anyOk = counts.some((n) => n !== null) || ytLive !== null;

    return new Response(
      JSON.stringify({
        ok: true,
        viewers: anyOk ? total : null,
        perStream: counts,
        youtubeLive: ytLive,
        debug: body?.debug ? debug : undefined,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
