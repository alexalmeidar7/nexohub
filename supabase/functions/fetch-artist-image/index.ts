const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const cache = new Map<string, { url: string; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000;

const PLACEHOLDER_HASHES = [
  "d41d8cd98f00b204e9800998ecf8427e",
  "2a7c75fe7e249e43eb37b1e84b8ba8ba",
];

const isValidImage = (url: string | undefined): url is string =>
  !!url && !PLACEHOLDER_HASHES.some(h => url.includes(h));

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

/** Find the best-matching artist (exact name match) to avoid feats/collaborators. */
async function findArtist(artist: string): Promise<{ id: number; name: string; picture_xl?: string } | null> {
  const query = encodeURIComponent(artist);
  const res = await fetch(`https://api.deezer.com/search/artist?q=${query}&limit=10`, {
    signal: AbortSignal.timeout(4000),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const list = (data?.data ?? []) as Array<{ id: number; name: string; picture_xl?: string }>;
  if (!list.length) return null;
  const target = norm(artist);
  // Prefer exact normalized name match
  const exact = list.find(a => norm(a.name) === target);
  return exact ?? list[0];
}

/** Get alternate images of the SAME artist from their albums (cover art). */
async function getArtistAlbumCovers(artistId: number): Promise<string[]> {
  try {
    const res = await fetch(`https://api.deezer.com/artist/${artistId}/albums?limit=25`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const albums = (data?.data ?? []) as Array<{ cover_xl?: string; cover_big?: string }>;
    return albums
      .map(a => a.cover_xl || a.cover_big)
      .filter(isValidImage) as string[];
  } catch {
    return [];
  }
}

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

    if (skip === 0) {
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.ts < CACHE_TTL) {
        return new Response(
          JSON.stringify({ ok: true, url: cached.url, cached: true }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const matched = await findArtist(artist);
    if (!matched) {
      return new Response(
        JSON.stringify({ ok: false, error: "Artist not found" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build candidate pool: official artist photo first, then album covers (same artist).
    const candidates: string[] = [];
    if (isValidImage(matched.picture_xl)) candidates.push(matched.picture_xl);

    if (skip > 0 || candidates.length === 0) {
      const covers = await getArtistAlbumCovers(matched.id);
      for (const c of covers) {
        if (!candidates.includes(c)) candidates.push(c);
      }
    }

    if (!candidates.length) {
      return new Response(
        JSON.stringify({ ok: false, error: "No real artist image" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const imageUrl = candidates[skip % candidates.length];

    if (skip === 0) cache.set(cacheKey, { url: imageUrl, ts: Date.now() });

    return new Response(
      JSON.stringify({ ok: true, url: imageUrl, name: matched.name, total: candidates.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
