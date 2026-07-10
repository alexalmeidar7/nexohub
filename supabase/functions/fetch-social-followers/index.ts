// Fetches follower counts for YouTube / Instagram / Facebook via
// server-side scraping of public pages. Best-effort; returns null
// when a page blocks scraping (Meta blocks datacenter IPs).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const UA_META =
  "Mozilla/5.0 (compatible; facebookexternalhit/1.1; +http://www.facebook.com/externalhit_uatext.php)";

function parseCompact(str: string): number | null {
  if (!str) return null;
  let s = str.trim().toLowerCase();
  if (/^[\d][\d\s.,\u00a0]*$/.test(s) && !/[kmb]/.test(s)) {
    const n = parseInt(s.replace(/[\s\u00a0.,]/g, ""), 10);
    return isNaN(n) ? null : n;
  }
  const norm = s.replace(/\s/g, "").replace(",", ".");
  const m = norm.match(/([\d.]+)\s*(mil|mm|mi|k|m|b|thousand|million|billion|milh(?:ão|ões))?/i);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (isNaN(num)) return null;
  const suf = (m[2] || "").toLowerCase();
  if (suf === "k" || suf === "mil" || suf.startsWith("thou")) return Math.round(num * 1_000);
  if (suf === "m" || suf === "mi" || suf.startsWith("mill") || suf.startsWith("milh")) return Math.round(num * 1_000_000);
  if (suf === "b" || suf === "mm" || suf.startsWith("bill")) return Math.round(num * 1_000_000_000);
  return Math.round(num);
}

async function fetchHtml(url: string, ua = UA_DESKTOP): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": ua,
        "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

async function fetchYoutube(url: string): Promise<number | null> {
  const html = await fetchHtml(url, UA_DESKTOP);
  if (!html) return null;
  // Prefer accessibilityLabel which is human-readable (e.g. "22.2 thousand subscribers").
  const m1 = html.match(/"accessibilityLabel":"([\d.,]+ ?(?:thousand|million|billion|mil|milh(?:ão|ões))? ?(?:subscribers|inscritos))"/i);
  if (m1) {
    const cleaned = m1[1].replace(/(subscribers|inscritos)/i, "").trim();
    const n = parseCompact(cleaned);
    if (n) return n;
  }
  // Content pattern: "content":"22.2K subscribers"
  const m2 = html.match(/"content":"([\d.,]+ ?[KMB]?) ?(?:subscribers|inscritos)"/i);
  if (m2) {
    const n = parseCompact(m2[1]);
    if (n) return n;
  }
  // Legacy subscriberCountText
  const m3 = html.match(/"subscriberCountText":\{[^}]*?"simpleText":"([^"]+)"/);
  if (m3) {
    const cleaned = m3[1].replace(/(subscribers|inscritos)/i, "").trim();
    const n = parseCompact(cleaned);
    if (n) return n;
  }
  return null;
}

async function fetchInstagram(url: string): Promise<number | null> {
  // Meta blocks datacenter IPs from receiving og:description meta.
  const html = await fetchHtml(url, UA_META);
  if (!html) return null;
  const m = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  if (m) {
    const f = m[1].match(/([\d.,]+\s*[kmb]?)\s*(?:Followers|Seguidores)/i);
    if (f) return parseCompact(f[1]);
  }
  return null;
}

async function fetchFacebook(url: string): Promise<number | null> {
  const html = await fetchHtml(url, UA_META);
  if (!html) return null;
  const m = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  if (m) {
    const desc = m[1]
      .replace(/&#xa0;|&nbsp;/gi, " ")
      .replace(/&#x([0-9a-f]+);/gi, (_s, h) => String.fromCharCode(parseInt(h, 16)));
    const words = "followers|seguidores|curtidas|likes|gillar|gefällt|aiment|gusta";
    const re = new RegExp(`([\\d][\\d\\s.,\\u00a0]*[kmb]?)\\s*(?:${words})`, "i");
    const f = desc.match(re);
    if (f) return parseCompact(f[1]);
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const youtube = typeof body?.youtube === "string" && body.youtube.trim() ? body.youtube.trim() : null;
    const instagram = typeof body?.instagram === "string" && body.instagram.trim() ? body.instagram.trim() : null;
    const facebook = typeof body?.facebook === "string" && body.facebook.trim() ? body.facebook.trim() : null;

    const [yt, ig, fb] = await Promise.all([
      youtube ? fetchYoutube(youtube).catch(() => null) : Promise.resolve(null),
      instagram ? fetchInstagram(instagram).catch(() => null) : Promise.resolve(null),
      facebook ? fetchFacebook(facebook).catch(() => null) : Promise.resolve(null),
    ]);

    return new Response(
      JSON.stringify({ ok: true, youtube: yt, instagram: ig, facebook: fb }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
