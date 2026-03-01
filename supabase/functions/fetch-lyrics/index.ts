const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { artist, title, duration } = await req.json();

    if (!artist || !title) {
      return new Response(
        JSON.stringify({ success: false, error: 'Artist and title are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching lyrics for: ${artist} - ${title}`);

    // Try exact match first with GET endpoint
    const params = new URLSearchParams({
      artist_name: artist,
      track_name: title,
    });
    if (duration) {
      params.set('duration', duration.toString());
    }

    let syncedLyrics: string | null = null;
    let plainLyrics: string | null = null;

    // Try GET (exact match)
    const getResp = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: { 'User-Agent': 'MasterView Player v1.0' },
    });

    if (getResp.ok) {
      const data = await getResp.json();
      syncedLyrics = data.syncedLyrics || null;
      plainLyrics = data.plainLyrics || null;
    }

    // Fallback to search if no synced lyrics found
    if (!syncedLyrics) {
      const searchParams = new URLSearchParams({ q: `${artist} ${title}` });
      const searchResp = await fetch(`https://lrclib.net/api/search?${searchParams.toString()}`, {
        headers: { 'User-Agent': 'MasterView Player v1.0' },
      });

      if (searchResp.ok) {
        const results = await searchResp.json();
        // Find first result with synced lyrics
        const match = results.find((r: any) => r.syncedLyrics);
        if (match) {
          syncedLyrics = match.syncedLyrics;
          plainLyrics = match.plainLyrics || plainLyrics;
        } else if (results.length > 0 && !plainLyrics) {
          plainLyrics = results[0].plainLyrics || null;
        }
      }
    }

    if (!syncedLyrics && !plainLyrics) {
      return new Response(
        JSON.stringify({ success: false, error: 'Lyrics not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found lyrics: synced=${!!syncedLyrics}, plain=${!!plainLyrics}`);

    return new Response(
      JSON.stringify({ success: true, syncedLyrics, plainLyrics }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching lyrics:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
