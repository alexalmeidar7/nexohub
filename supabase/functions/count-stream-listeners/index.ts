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
  const path = rawPath.replace(/^\/+/, "").split("/").map(s => s.trim()).filter(Boolean);
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
const LISTENER_TAGS = [
  "listeners",
  "currentlisteners",
  "current_listeners",
  "espectadores_conectados",
  "espectadores",
  "ouvintes",
  "connected",
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


async function fetchListenersForUrl(streamUrl: string): Promise<number | null> {
  try {
    const u = new URL(streamUrl);
    const base = `${u.protocol}//${u.host}`;
    const mount = u.pathname;

    // 1) Icecast JSON stats
    try {
      const r = await fetch(`${base}/status-json.xsl`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok) {
        const j = await r.json();
        const src = j?.icestats?.source;
        if (Array.isArray(src)) {
          const match = src.find((s: any) => {
            try { return s?.listenurl && new URL(s.listenurl).pathname === mount; }
            catch { return false; }
          });
          if (match?.listeners != null) return Number(match.listeners) || 0;
          return src.reduce((a: number, s: any) => a + (Number(s?.listeners) || 0), 0);
        }
        if (src?.listeners != null) return Number(src.listeners) || 0;
      }
    } catch { /* try next */ }

    // 2) Shoutcast v2 JSON
    try {
      const r = await fetch(`${base}/stats?json=1`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok) {
        const j = await r.json();
        if (j?.currentlisteners != null) return Number(j.currentlisteners) || 0;
      }
    } catch { /* try next */ }

    // 3) Shoutcast v1 /7.html
    try {
      const r = await fetch(`${base}/7.html`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(6000),
      });
      if (r.ok) {
        const t = await r.text();
        const m = t.replace(/<[^>]+>/g, "").match(/(\d+)\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*\d+/);
        if (m) return Number(m[1]) || 0;
      }
    } catch { /* fall through */ }

    return null;
  } catch { return null; }
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

    // Fetch each URL. Priority order:
    //   1) explicit XPath, 2) generic listener tag auto-detect on the same URL,
    //   3) Icecast/Shoutcast URL-shape auto-detect.
    const counts = await Promise.all(
      urls.map(async (u) => {
        if (xpath) {
          const v = await fetchWithXPath(u, xpath);
          if (v !== null) return v;
        }
        const g = await fetchGenericListeners(u);
        if (g !== null) return g;
        return fetchListenersForUrl(u);
      }),
    );

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
