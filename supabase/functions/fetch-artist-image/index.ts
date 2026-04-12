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

    // Reject Deezer default placeholder images (generic dark silhouette).
    // Real artist images include the artist's numeric ID in the URL path,
    // e.g. ".../artist/12345/..." — placeholders use a generic hash instead.
    const deezerArtistId = String(artistData.id || "");
    const isPlaceholder = deezerArtistId && !imageUrl.includes(`/${deezerArtistId}/`);
    if (isPlaceholder) {
      return new Response(
        JSON.stringify({ ok: false, error: "No real artist image" }),
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
