// Counts current listeners for a user's active audio streams.
// Supports (a) explicit URL + XPath override, (b) Icecast/Shoutcast auto-detect,
// (c) generic JSON/XML fallback.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Minimal XPath-ish extractor. Supports paths like:
//   response/data/item/listeners
//   //info/espectadores_conectados
//   /root/child
// For XML: walks tag names in order (first match at each level).
// For JSON: walks object keys; if a value is an array, uses the first element.
function extractByPath(text: string, rawPath: string): number | null {
  // Accept both slash- and dot-separated paths (e.g. "icestats/source/listeners"
  // and "icestats.source.listeners"), which is how users commonly write them.
  const path = rawPath.replace(/^\/+/, "").split(/[\/.]/).map(s => s.trim()).filter(Boolean);
  if (path.length === 0) return null;
  const trimmed = text.trim();

  // Try JSON first if it looks like JSON
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
    } catch { /* fall through to XML */ }
  }

  // XML: walk tag names in order, extracting inner content each level.
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

async function fetchWithXPath(url: string, xpath: string): Promise<number | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const text = await r.text();
    return extractByPath(text, xpath);
  } catch { return null; }
}

// Generic listener extractor when no XPath was configured. Tries common tags
// used by Icecast/Shoutcast/CentovaCast/SonicPanel/etc.
// NOTE: do NOT include "connected" here — in Icecast that field is the source
// uptime in seconds, not the current listener count, and would appear before
// "listeners" in the JSON, corrupting the auto-detect result.
const LISTENER_TAGS = [
  "listeners",
  "currentlisteners",
  "current_listeners",
  "espectadores_conectados",
  "espectadores",
  "ouvintes",
];

function autoDetectListeners(text: string): number | null {
  const trimmed = text.trim();
  // Try JSON first
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
            if (LISTENER_TAGS.includes(k.toLowerCase())) {
              const n = typeof v === "string" ? parseInt(v, 10) : Number(v);
              if (Number.isFinite(n)) return n;
            }
          }
          for (const v of Object.values(node)) {
            const r = walk(v); if (r != null) return r;
          }
        }
        return null;
      };
      const n = walk(j); if (n != null) return n;
    } catch { /* fall through */ }
  }
  // XML: look for common tags anywhere in the document
  for (const tag of LISTENER_TAGS) {
    const re = new RegExp(`<${tag}[^>]*>\\s*(\\d+)\\s*<\\/${tag}>`, "i");
    const m = trimmed.match(re);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

async function fetchGenericListeners(url: string): Promise<number | null> {
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const text = await r.text();
    return autoDetectListeners(text);
  } catch { return null; }
}


// Runs all provider probes in parallel and returns the first non-null count.
// Much faster than the previous sequential await chain (avoids paying 6-8s
// timeouts when the first provider is unreachable).
async function fetchListenersForUrl(streamUrl: string): Promise<number | null> {
  let u: URL;
  try { u = new URL(streamUrl); } catch { return null; }
  const base = `${u.protocol}//${u.host}`;
  const mount = u.pathname;
  const hdr = { "User-Agent": "Mozilla/5.0" };
  const T = 6000;

  const probes: Array<Promise<number | null>> = [
    // Icecast JSON stats
    (async () => {
      const r = await fetch(`${base}/status-json.xsl`, { headers: hdr, signal: AbortSignal.timeout(T) });
      if (!r.ok) return null;
      const j = await r.json();
      const src = j?.icestats?.source;
      if (Array.isArray(src)) {
        const match = src.find((s: any) => { try { return s?.listenurl && new URL(s.listenurl).pathname === mount; } catch { return false; } });
        if (match?.listeners != null) return Number(match.listeners) || 0;
        return src.reduce((a: number, s: any) => a + (Number(s?.listeners) || 0), 0);
      }
      if (src?.listeners != null) return Number(src.listeners) || 0;
      return null;
    })(),
    // Shoutcast v2 JSON
    (async () => {
      const r = await fetch(`${base}/stats?json=1`, { headers: hdr, signal: AbortSignal.timeout(T) });
      if (!r.ok) return null;
      const j = await r.json();
      return j?.currentlisteners != null ? (Number(j.currentlisteners) || 0) : null;
    })(),
    // Shoutcast v1 /7.html
    (async () => {
      const r = await fetch(`${base}/7.html`, { headers: hdr, signal: AbortSignal.timeout(T) });
      if (!r.ok) return null;
      const t = await r.text();
      const m = t.replace(/<[^>]+>/g, "").match(/(\d+)\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+/);
      return m ? (Number(m[1]) || 0) : null;
    })(),
    // Icecast status2.xsl (CSV)
    (async () => {
      const r = await fetch(`${base}/status2.xsl`, { headers: hdr, signal: AbortSignal.timeout(T) });
      if (!r.ok) return null;
      const t = await r.text();
      const lines = t.split(/\r?\n/).filter((ln) => ln.startsWith("/"));
      for (const ln of lines) {
        const cols = ln.split(",");
        if (cols[0]?.trim() === mount) {
          const n = parseInt(cols[3]?.trim() ?? "", 10);
          if (Number.isFinite(n)) return n;
        }
      }
      let total = 0; let found = false;
      for (const ln of lines) {
        const n = parseInt(ln.split(",")[3]?.trim() ?? "", 10);
        if (Number.isFinite(n)) { total += n; found = true; }
      }
      return found ? total : null;
    })(),
    // Icecast status.xsl (HTML)
    (async () => {
      const r = await fetch(`${base}/status.xsl`, { headers: hdr, signal: AbortSignal.timeout(T) });
      if (!r.ok) return null;
      const t = await r.text();
      const mountIdx = t.indexOf(`Mount Point ${mount}`);
      const scope = mountIdx >= 0 ? t.slice(mountIdx) : t;
      const m = scope.match(/Current Listeners:\s*<\/td>\s*<td[^>]*>\s*(\d+)/i);
      return m ? parseInt(m[1], 10) : null;
    })(),
  ].map((p) => p.catch(() => null));

  // Return first non-null result (fastest wins); fall back to null if all fail.
  try {
    return await Promise.any(
      probes.map(async (p) => {
        const v = await p;
        if (v === null) throw new Error("null");
        return v;
      }),
    );
  } catch {
    return null;
  }
}

// ---- Cache layer ---------------------------------------------------------
// TTL cache + in-flight dedupe. Keyed by URL+xpath.
const CACHE_TTL_MS = 15_000;
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
    const strategies: Array<Promise<number | null>> = [];
    if (xpath) strategies.push(fetchWithXPath(url, xpath));
    strategies.push(fetchGenericListeners(url));
    strategies.push(fetchListenersForUrl(url));
    let value: number | null = null;
    try {
      value = await Promise.any(
        strategies.map(async (pr) => {
          const v = await pr; if (v === null) throw new Error("null"); return v;
        }),
      );
    } catch { value = null; }
    // Cache successes for full TTL; cache misses only briefly to avoid hammering.
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
          `${supaUrl}/rest/v1/streaming_channels?user_id=eq.${userId}&type=eq.audio_live&active=eq.true&select=url`,
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

    // In-memory cache per URL+xpath (survives across warm invocations).
    // Dramatically reduces upstream requests when multiple tabs/users share a URL.
    const counts = await Promise.all(urls.map((u) => resolveCached(u, xpath)));

    urls.forEach((u, i) => debug.push(`${u} -> ${counts[i]}`));
    const total = counts.reduce((a, n) => a + (n ?? 0), 0);
    const anyOk = counts.some((n) => n !== null);

    return new Response(
      JSON.stringify({
        ok: true,
        listeners: anyOk ? total : null,
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
