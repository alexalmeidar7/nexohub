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

function extractInstagramUsername(input: string): string | null {
  if (!input) return null;
  const s = input.trim();
  const m = s.match(/instagram\.com\/([^/?#\s]+)/i);
  if (m) return m[1];
  // Assume bare username
  return s.replace(/^@/, "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").trim() || null;
}

async function fetchInstagramViaRapidApi(username: string, debug?: string[]): Promise<number | null> {
  const key = Deno.env.get("RAPIDAPI_KEY");
  if (!key) { debug?.push("no RAPIDAPI_KEY"); return null; }
  debug?.push(`rapidapi key len=${key.length}`);
  const hosts: Array<{ host: string; url: string; pick: (j: any) => number | null | undefined }> = [
    {
      host: "instagram-scraper-api2.p.rapidapi.com",
      url: `https://instagram-scraper-api2.p.rapidapi.com/v1/info?username_or_id_or_url=${encodeURIComponent(username)}`,
      pick: (j) => j?.data?.follower_count ?? j?.data?.edge_followed_by?.count,
    },
    {
      host: "instagram-social-api.p.rapidapi.com",
      url: `https://instagram-social-api.p.rapidapi.com/v1/info?username_or_id_or_url=${encodeURIComponent(username)}`,
      pick: (j) => j?.data?.follower_count,
    },
    {
      host: "instagram-scraper-20251.p.rapidapi.com",
      url: `https://instagram-scraper-20251.p.rapidapi.com/userinfo/${encodeURIComponent(username)}`,
      pick: (j) => j?.data?.user?.follower_count ?? j?.data?.follower_count,
    },
    {
      host: "instagram-scraper-2022.p.rapidapi.com",
      url: `https://instagram-scraper-2022.p.rapidapi.com/ig/info_username/?user=${encodeURIComponent(username)}`,
      pick: (j) => j?.user?.follower_count,
    },
    {
      host: "instagram-data1.p.rapidapi.com",
      url: `https://instagram-data1.p.rapidapi.com/user/info?username=${encodeURIComponent(username)}`,
      pick: (j) => j?.edge_followed_by?.count ?? j?.follower_count,
    },
    {
      host: "instagram-bulk-profile-scrapper.p.rapidapi.com",
      url: `https://instagram-bulk-profile-scrapper.p.rapidapi.com/clients/api/ig/ig_profile?ig=${encodeURIComponent(username)}`,
      pick: (j) => Array.isArray(j) ? j[0]?.follower_count : j?.follower_count,
    },
  ];
  for (const h of hosts) {
    try {
      const r = await fetch(h.url, {
        headers: { "X-RapidAPI-Key": key, "X-RapidAPI-Host": h.host },
      });
      const text = await r.text();
      if (!r.ok) {
        debug?.push(`${h.host} HTTP ${r.status}: ${text.slice(0, 120)}`);
        continue;
      }
      let j: any = null;
      try { j = JSON.parse(text); } catch { debug?.push(`${h.host} non-json`); continue; }
      const n = h.pick(j);
      debug?.push(`${h.host} count=${n}`);
      if (typeof n === "number" && n > 0) return n;
    } catch (e) {
      debug?.push(`${h.host} error: ${e}`);
    }
  }
  return null;
}

async function fetchInstagramViaSocialBlade(username: string, debug?: string[]): Promise<number | null> {
  const url = `https://socialblade.com/instagram/user/${encodeURIComponent(username)}`;
  const html = await fetchHtml(url, UA_DESKTOP);
  debug?.push(`socialblade html=${html ? html.length : 0}`);
  if (!html) return null;

  const patterns = [
    /"followers"\s*:\s*"?(\d[\d,.]*)"?/i,
    /"followerCount"\s*:\s*"?(\d[\d,.]*)"?/i,
    /"followers_count"\s*:\s*"?(\d[\d,.]*)"?/i,
    /(?:followers|seguidores)[^\d]{0,80}(\d[\d,.]*\s*[kmb]?)/i,
    /(\d[\d,.]*\s*[kmb]?)\s*(?:followers|seguidores)/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (!match) continue;
    const n = parseCompact(match[1]);
    debug?.push(`socialblade count=${n}`);
    if (n && n > 0) return n;
  }

  return null;
}

async function fetchInstagram(url: string, debug?: string[]): Promise<number | null> {
  // Try public og:description first (usually blocked from datacenter IPs).
  const html = await fetchHtml(url, UA_META);
  debug?.push(`og html=${html ? html.length : 0}`);
  if (html) {
    const m = html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i);
    if (m) {
      const f = m[1].match(/([\d.,]+\s*[kmb]?)\s*(?:Followers|Seguidores)/i);
      if (f) {
        const n = parseCompact(f[1]);
        if (n) return n;
      }
    }
  }
  // Fallback: RapidAPI Instagram scraper.
  const username = extractInstagramUsername(url);
  debug?.push(`username=${username}`);
  if (username) {
    const socialBladeCount = await fetchInstagramViaSocialBlade(username, debug);
    if (socialBladeCount) return socialBladeCount;

    const n = await fetchInstagramViaRapidApi(username, debug);
    if (n) return n;
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
    let youtube = typeof body?.youtube === "string" && body.youtube.trim() ? body.youtube.trim() : null;
    let instagram = typeof body?.instagram === "string" && body.instagram.trim() ? body.instagram.trim() : null;
    let facebook = typeof body?.facebook === "string" && body.facebook.trim() ? body.facebook.trim() : null;
    let manualYt: number | null = null;
    let manualIg: number | null = null;
    let manualFb: number | null = null;

    // If a userId is provided, look up URLs + manual overrides via service role
    // so end-users (visitors without direct RLS access) can still see counts.
    const userId = typeof body?.userId === "string" && body.userId.trim() ? body.userId.trim() : null;
    const debug: string[] = [];
    if (userId) {
      const supaUrl = Deno.env.get("SUPABASE_URL");
      const svcKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supaUrl && svcKey) {
        try {
          const r = await fetch(
            `${supaUrl}/rest/v1/empresa_config?user_id=eq.${userId}&select=youtube,instagram,facebook,youtube_subs,instagram_subs,facebook_subs`,
            { headers: { apikey: svcKey, Authorization: `Bearer ${svcKey}` } },
          );
          if (r.ok) {
            const rows = await r.json();
            const row = Array.isArray(rows) && rows[0] ? rows[0] : null;
            if (row) {
              youtube = youtube || (row.youtube || null);
              instagram = instagram || (row.instagram || null);
              facebook = facebook || (row.facebook || null);
              manualYt = row.youtube_subs != null ? Number(row.youtube_subs) : null;
              manualIg = row.instagram_subs != null ? Number(row.instagram_subs) : null;
              manualFb = row.facebook_subs != null ? Number(row.facebook_subs) : null;
              debug.push(`lookup ok yt=${!!youtube} ig=${!!instagram} fb=${!!facebook}`);
            } else {
              debug.push("lookup empty");
            }
          } else {
            debug.push(`lookup http=${r.status}`);
          }
        } catch (e) {
          debug.push(`lookup err ${e}`);
        }
      }
    }

    const [yt, ig, fb] = await Promise.all([
      youtube ? fetchYoutube(youtube).catch(() => null) : Promise.resolve(null),
      instagram ? fetchInstagram(instagram, debug).catch((e) => { debug.push(`ig err ${e}`); return null; }) : Promise.resolve(null),
      facebook ? fetchFacebook(facebook).catch(() => null) : Promise.resolve(null),
    ]);

    return new Response(
      JSON.stringify({
        ok: true,
        youtube: manualYt ?? yt,
        instagram: manualIg ?? ig,
        facebook: manualFb ?? fb,
        urls: userId ? { youtube, instagram, facebook } : undefined,
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
