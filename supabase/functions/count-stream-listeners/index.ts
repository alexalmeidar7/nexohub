// Counts current Icecast/Shoutcast listeners for a user's active audio streams.
// Sums `listeners` across all `audio_live` channels in streaming_channels.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function fetchListenersForUrl(streamUrl: string): Promise<number | null> {
  try {
    const u = new URL(streamUrl);
    const base = `${u.protocol}//${u.host}`;
    const mount = u.pathname; // e.g. "/stream"

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
          // Multiple mounts - prefer matching mount, else sum
          const match = src.find((s: any) => {
            try {
              return s?.listenurl && new URL(s.listenurl).pathname === mount;
            } catch { return false; }
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

    // 3) Shoutcast v1 /7.html (comma-separated: currentlisteners,streamstatus,peaklisteners,maxlisteners,uniquelisteners,bitrate,songtitle)
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
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const userId = typeof body?.userId === "string" && body.userId.trim() ? body.userId.trim() : null;
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

    const counts = await Promise.all(urls.map((u) => fetchListenersForUrl(u)));
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
