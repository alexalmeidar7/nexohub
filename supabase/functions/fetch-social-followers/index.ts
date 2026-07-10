// Fetches follower counts for YouTube / Instagram / Facebook via
// server-side scraping of public pages. Best-effort; returns null
// when a page blocks scraping or the pattern isn't found.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// facebookexternalhit reliably gets Open Graph meta from Meta/YouTube.
const UA_META =
  "Mozilla/5.0 (compatible; facebookexternalhit/1.1; +http://www.facebook.com/externalhit_uatext.php)";
const UA_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function parseCompact(str: string): number | null {
  if (!str) return null;
  let s = str.trim().toLowerCase();
  // If it looks like a plain grouped number (e.g. "56 416" or "56,416" or "56.416"),
  // strip common thousands separators.
  if (/^[\d][\d\s.,\u00a0]*$/.test(s) && !/[kmb]/.test(s)) {
    const digits = s.replace(/[\s\u00a0.,]/g, "");
    const n = parseInt(digits, 10);
    return isNaN(n) ? null : n;
  }
  // Suffixed compact form (12.3K, 1,2 mi, 3M, 1B, etc.)
  const norm = s.replace(/\s/g, "").replace(",", ".");
  const m = norm.match(/([\d.]+)\s*(mil|mm|mi|k|m|b)?/i);
  if (!m) return null;
  const num = parseFloat(m[1]);
  if (isNaN(num)) return null;
  const suf = (m[2] || "").toLowerCase();
  if (suf === "k" || suf === "mil") return Math.round(num * 1_000);
  if (suf === "m" || suf === "mi") return Math.round(num * 1_000_000);
  if (suf === "b" || suf === "mm") return Math.round(num * 1_000_000_000);
  return Math.round(num);
}

async function fetchHtml(url: string, ua = UA_META): Promise<string | null> {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": ua,
        "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    console.log(`[fetch] ${url} -> ${r.status}`);
    if (!r.ok) return null;
    const text = await r.text();
    console.log(`[fetch] ${url} bytes=${text.length}`);
    return text;
  } catch (e) {
    console.log(`[fetch] ${url} ERROR ${String(e)}`);
    return null;
  }
}

// Regex list of language-specific words meaning "followers" / "likes"
const FOLLOWER_WORDS =
  "followers|following you|seguidores|seguidor|curtidas|curtiram|gostam disto|likes|gillar|gefällt das|personas les gusta|me gusta|personnes aiment|j'aime|人がフォロー|フォロワー";

async function fetchYoutube(url: string): Promise<number | null> {
  // Try desktop first (has embedded JSON with subscriber count)
  const html = await fetchHtml(url, UA_DESKTOP);
  if (!html) return null;

  // New layout: "metadataParts":[{"text":{"content":"22.2K subscribers"}
  const m0 = html.match(/"metadataParts":\[\{"text":\{"content":"([^"]+?subscribers|[^"]+?inscritos)"/i);
  if (m0) {
    const n = parseCompact(m0[1].replace(/(subscribers|inscritos)/i, "").trim());
    if (n) return n;
  }
  // Accessibility label: "22.2 thousand subscribers"
  const m1 = html.match(/"accessibilityLabel":"([\d.,]+)\s*(thousand|million|billion|mil|milh(?:ão|ões))?\s*(?:subscribers|inscritos)"/i);
  if (m1) {
    const num = parseFloat(m1[1].replace(",", "."));
    const suf = (m1[2] || "").toLowerCase();
    if (!isNaN(num)) {
      if (suf.startsWith("thou") || suf === "mil") return Math.round(num * 1_000);
      if (suf.startsWith("mill") || suf.startsWith("milh")) return Math.round(num * 1_000_000);
      if (suf.startsWith("bill")) return Math.round(num * 1_000_000_000);
      return Math.round(num);
    }
  }
  // Legacy: "subscriberCountText":{"simpleText":"12.3K subscribers"}
  const m2 = html.match(/"subscriberCountText":\{[^}]*?"simpleText":"([^"]+)"/);
  if (m2) {
    const n = parseCompact(m2[1].replace(/(subscribers|inscritos)/i, "").trim());
    if (n) return n;
  }
  return null;
}

async function fetchInstagram(url: string): Promise<number | null> {
  const html = await fetchHtml(url, UA_META);
  if (!html) return null;
  // og:description like: "118K Followers, 3,173 Following, 11K Posts - See Instagram ..."
  const m = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  if (m) {
    const desc = m[1];
    const f = desc.match(/([\d.,]+\s*[kmb]?)\s*Followers/i)
      || desc.match(/([\d.,]+\s*[kmb]?)\s*Seguidor/i);
    if (f) {
      const n = parseCompact(f[1]);
      if (n) return n;
    }
  }
  return null;
}

async function fetchFacebook(url: string): Promise<number | null> {
  const html = await fetchHtml(url, UA_META);
  if (!html) return null;
  const m = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
  if (m) {
    // Decode HTML entities for spaces/accents that may split the number
    const desc = m[1]
      .replace(/&#xa0;|&nbsp;/gi, " ")
      .replace(/&#x([0-9a-f]+);/gi, (_s, h) => String.fromCharCode(parseInt(h, 16)))
      .replace(/&amp;/gi, "&");
    // Try each known follower/likes word
    const re = new RegExp(`([\\d][\\d\\s.,\\u00a0]*[kmb]?)\\s*(?:${FOLLOWER_WORDS})`, "i");
    const f = desc.match(re);
    if (f) {
      const n = parseCompact(f[1]);
      if (n) return n;
    }
  }
  return null;
}

async function diag(url: string, ua = UA_DESKTOP): Promise<any> {
  try {
    const r = await fetch(url, {
      headers: {
        "User-Agent": ua,
        "Accept-Language": "en-US,en;q=0.9,pt-BR;q=0.8",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    const txt = r.ok ? await r.text() : "";
    const og = txt.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    const hits: string[] = [];
    // Search for channel-own subscriber patterns
    const patterns = [
      /"content":"([^"]{1,40}(?:subscribers|inscritos))"/gi,
      /"simpleText":"([^"]{1,40}(?:subscribers|inscritos))"/gi,
      /"accessibilityLabel":"([^"]{1,80}(?:subscribers|inscritos))"/gi,
      /([\d.,]+ ?[KMB]?) ?(?:Followers|Seguidores)/gi,
      /([\d.,\s]+ ?[KMB]?) ?(?:gillar|likes|curtidas|gefällt|aiment|gusta)/gi,
    ];
    for (const p of patterns) {
      let mm;
      let c = 0;
      while ((mm = p.exec(txt)) && c < 3) { hits.push(mm[0]); c++; }
    }
    return { status: r.status, bytes: txt.length, og: og ? og[1].slice(0, 200) : null, hits: hits.slice(0, 15) };
  } catch (e) {
    return { error: String(e) };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  try {
    const url = new URL(req.url);
    const body = await req.json().catch(() => ({}));
    const youtube = typeof body?.youtube === "string" && body.youtube.trim() ? body.youtube.trim() : null;
    const instagram = typeof body?.instagram === "string" && body.instagram.trim() ? body.instagram.trim() : null;
    const facebook = typeof body?.facebook === "string" && body.facebook.trim() ? body.facebook.trim() : null;

    if (url.searchParams.get("debug") === "1") {
      const d: any = {};
      if (youtube) d.youtube = await diag(youtube, UA_DESKTOP);
      if (instagram) d.instagram = await diag(instagram, UA_META);
      if (facebook) d.facebook = await diag(facebook, UA_META);
      return new Response(JSON.stringify({ ok: true, debug: d }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
