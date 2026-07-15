// Counts current viewers for a user's active video streams.
// Fastest-wins strategy: runs XPath override (if set), generic viewer-tag
// auto-detect, HLS m3u8 EXT-X-VIEWERS scan and provider-specific probes
// (YouTube Live "watching now") in parallel. First non-null result wins.
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
const cache = new Map<string, { value: number | null; expires: number }>();
const inflight = new Map<string, Promise<number | null>>();

async function resolveCached(url: string, xpath: string | null): Promise<number | null> {
  const key = `${url}\u0000${xpath ?? ""}`;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expires > now) return hit.value;
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = (async () => {
    const value = await raceStrategies(url, xpath);
    cache.set(key, { value, expires: Date.now() + (value == null ? 5_000 : CACHE_TTL_MS) });
    inflight.delete(key);
    return value;
  })();
  inflight.set(key, p);
  return p;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const userId = typeof body?.userId === "string" && body.userId.trim() ? body.userId.trim() : null;
    const xpath = typeof body?.xpath === "string" && body.xpath.trim() ? body.xpath.trim() : null;
    const debug: string[] = [];

    let urls: string[] = [];
    if (Array.isArray(body?.urls)) {
      urls = body.urls.filter((u: unknown) => typeof u === "string" && u);
    } else if (userId) {
      const supaUrl = Deno.env.get("SUPABASE_URL");
      const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supaUrl && svcKey) {
        const r = await fetch(
          `${supaUrl}/rest/v1/streaming_channels?user_id=eq.${userId}&type=eq.video_live&active=eq.true&select=url`,
          { headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` } },
        );
        if (r.ok) {
          const rows = await r.json();
          urls = (Array.isArray(rows) ? rows : []).map((x: any) => x.url).filter(Boolean);
          debug.push(`channels=${urls.length}`);
        } else {
          debug.push(`lookup http=${r.status}`);
        }
      }
    }

    const counts = await Promise.all(urls.map((u) => raceStrategies(u, xpath)));
    urls.forEach((u, i) => debug.push(`${u} -> ${counts[i]}`));

    const total = counts.reduce((a, n) => a + (n ?? 0), 0);
    const anyOk = counts.some((n) => n !== null);

    return new Response(
      JSON.stringify({
        ok: true,
        viewers: anyOk ? total : null,
        perStream: counts,
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
