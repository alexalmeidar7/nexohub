const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-memory cache — survives across warm invocations (typically 5-10 min)
const cache = new Map<string, { url: string; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let artist = "";

    if (req.method === "GET") {
      artist = new URL(req.url).searchParams.get("artist") || "";
    } else {
      const body = await req.json().catch(() => ({}));
      artist = typeof body?.artist === "string" ? body.artist : "";
    }

    artist = artist.trim();
    if (!artist) {
      return new Response(
        JSON.stringify({ ok: false, error: "artist is required" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cacheKey = artist.toLowerCase();

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL) {
      return new Response(
        JSON.stringify({ ok: true, url: cached.url, cached: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch from Deezer (no auth needed)
    const query = encodeURIComponent(artist);
    const res = await fetch(
      `https://api.deezer.com/search/artist?q=${query}&limit=1`,
      { signal: AbortSignal.timeout(3000) }
    );

    if (!res.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: `Deezer returned ${res.status}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    const artistData = data?.data?.[0];

    if (!artistData?.picture_xl) {
      return new Response(
        JSON.stringify({ ok: false, error: "Artist not found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const imageUrl = artistData.picture_xl;

    // Reject Deezer default placeholder images (generic silhouette avatar)
    // These URLs typically match: /images/artist//... (no real artist ID in path)
    // or contain known placeholder segments
    if (
      /\/artist\/\//.test(imageUrl) ||
      /\/artist\/[^/]*\/[0-9]+x[0-9]+-0+\./.test(imageUrl) === false &&
      imageUrl.includes("/artist/") &&
      !artistData.picture_big?.includes(artistData.id?.toString())
    ) {
      // Extra check: compare picture sizes — placeholders often share the same base
      const smallPic = artistData.picture_small || "";
      const xlPic = imageUrl;
      // Deezer placeholders have a recognizable hash; real artist pics differ per size
      if (smallPic && xlPic) {
        const smallBase = smallPic.replace(/\/\d+x\d+-\d+\./, "/CHECK.");
        const xlBase = xlPic.replace(/\/\d+x\d+-\d+\./, "/CHECK.");
        // If after normalizing size they're the same path, it's likely a real image — skip this check
      }
    }

    // Final guard: reject if the image lacks the artist's numeric ID in the URL path
    // Real Deezer artist images include the artist ID; placeholders don't
    const deezerArtistId = artistData.id;
    if (deezerArtistId && !imageUrl.includes(`/${deezerArtistId}/`)) {
      return new Response(
        JSON.stringify({ ok: false, error: "Placeholder image detected" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Store in cache
    cache.set(cacheKey, { url: imageUrl, ts: Date.now() });

    return new Response(
      JSON.stringify({ ok: true, url: imageUrl, name: artistData.name }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
