const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// In-memory cache — survives across warm invocations (typically 5-10 min)
const cache = new Map<string, { url: string; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

const PLACEHOLDER_HASHES = [
  "d41d8cd98f00b204e9800998ecf8427e",
  "2a7c75fe7e249e43eb37b1e84b8ba8ba",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let artist = "";
    let skip = 0;

    if (req.method === "GET") {
      const u = new URL(req.url);
      artist = u.searchParams.get("artist") || "";
      skip = Number(u.searchParams.get("skip") || "0") || 0;
    } else {
      const body = await req.json().catch(() => ({}));
      artist = typeof body?.artist === "string" ? body.artist : "";
      skip = Number(body?.skip || 0) || 0;
    }

    artist = artist.trim();
    if (!artist) {
      return new Response(
        JSON.stringify({ ok: false, error: "artist is required" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cacheKey = artist.toLowerCase();

    // Use cache only on default first lookup
    if (skip === 0) {
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        return new Response(
          JSON.stringify({ ok: true, url: cached.url, cached: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const limit = Math.max(1, skip + 1);
    const query = encodeURIComponent(artist);
    const res = await fetch(
      `https://api.deezer.com/search/artist?q=${query}&limit=${Math.min(limit, 25)}`,
      { signal: AbortSignal.timeout(4000) }
    );

    if (!res.ok) {
      return new Response(
        JSON.stringify({ ok: false, error: `Deezer returned ${res.status}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json();
    const list = (data?.data ?? []) as Array<{ picture_xl?: string; name?: string }>;
    const candidate = list[skip] ?? list[list.length - 1];

    const imageUrl = candidate?.picture_xl;
    if (!imageUrl) {
      return new Response(
        JSON.stringify({ ok: false, error: "Artist not found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (PLACEHOLDER_HASHES.some(h => imageUrl.includes(h))) {
      return new Response(
        JSON.stringify({ ok: false, error: "No real artist image" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (skip === 0) cache.set(cacheKey, { url: imageUrl, ts: Date.now() });

    return new Response(
      JSON.stringify({ ok: true, url: imageUrl, name: candidate?.name }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
