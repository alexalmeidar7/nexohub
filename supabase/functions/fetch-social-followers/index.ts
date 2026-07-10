// Fetches follower counts for YouTube / Instagram / Facebook by
// server-side scraping public pages. Returns best-effort numbers;
// null when unavailable (private, blocked, or parse miss).
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function parseCompact(str: string): number | null {
  if (!str) return null;
  const s = str.replace(/\s/g, "").toLowerCase().replace(/,/g, ".");
  const m = s.match(/([\d.]+)\s*(k|m|b|mi|mil|mm)?/i);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (isNaN(num)) return null;
  const suf = (m[2] || "").toLowerCase();
  if (suf === "k" || suf === "mil") return Math.round(num * 1_000);
  if (suf === "m" || suf === "mi") return Math.round(num * 1_000_000);
  if (suf === "b" || suf === "mm") return Math.round(num * 1_000_000_000);
  return Math.round(num);
}

function extractDigits(str: string): number | null {
  const m = str.replace(/[.,](?=\d{3}\b)/g, "").match(/\d[\d]*/);
  if (!m) return null;
  const n = parseInt(m[0], 10);
  return isNaN(n) ? null : n;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8",
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
  const html = await fetchHtml(url);
  if (!html) return null;
  // subscriberCountText: {"simpleText":"12.3K subscribers"} or accessibility label
  const m1 = html.match(/"subscriberCountText":\s*\{\s*"(?:simpleText|accessibility)"[^}]*?"(?:simpleText|label)":"([^"]+)"/);
  if (m1) {
    const n = parseCompact(m1[1]);
    if (n) return n;
  }
  const m2 = html.match(/"subscriberCountText":\s*\{\s*"simpleText":"([^"]+)"/);
  if (m2) {
    const n = parseCompact(m2[1]);
    if (n) return n;
  }
  return null;
}

async function fetchInstagram(url: string): Promise<number | null> {
  const html = await fetchHtml(url);
  if (!html) return null;
  // og:description often: "12.3k Followers, 500 Following, 1,234 Posts - See Instagram photos ..."
  const m = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  if (m) {
    const desc = m[1];
    const f = desc.match(/([\d.,]+\s*[kmb]?)\s*Followers/i);
    if (f) {
      const n = parseCompact(f[1]);
      if (n) return n;
    }
  }
  return null;
}

async function fetchFacebook(url: string): Promise<number | null> {
  const html = await fetchHtml(url);
  if (!html) return null;
  // FB pages often hide numbers behind login. Try og:description and generic patterns.
  const m = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  if (m) {
    const desc = m[1];
    const f = desc.match(/([\d.,]+\s*[kmb]?)\s*(?:likes|followers|curtidas|seguidores)/i);
    if (f) {
      const n = parseCompact(f[1]);
      if (n) return n;
    }
  }
  const alt = html.match(/([\d.,]+)\s*(?:people follow this|pessoas seguem isso)/i);
  if (alt) {
    const n = extractDigits(alt[1]);
    if (n) return n;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const youtube = typeof body?.youtube === "string" && body.youtube.trim() ? body.youtube.trim() : null;
    const instagram = typeof body?.instagram === "string" && body.instagram.trim() ? body.instagram.trim() : null;
    const facebook = typeof body?.facebook === "string" && body.facebook.trim() ? body.facebook.trim() : null;

    const [yt, ig, fb] = await Promise.all([
      youtube ? fetchYoutube(youtube) : Promise.resolve(null),
      instagram ? fetchInstagram(instagram) : Promise.resolve(null),
      facebook ? fetchFacebook(facebook) : Promise.resolve(null),
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
