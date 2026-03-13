const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

// Simple fallback: distribute lyrics evenly (no AI)
function plainToLrc(plain: string, durationSec: number): string {
  const lines = plain.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return "";

  const introSec = 8;
  const outroSec = 5;
  const usable = Math.max(durationSec - introSec - outroSec, lines.length * 2);
  const perLine = usable / lines.length;

  return lines
    .map((text, i) => {
      const t = introSec + i * perLine;
      const mins = Math.floor(t / 60);
      const secs = Math.floor(t % 60);
      const ms = Math.floor((t % 1) * 100);
      return `[${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(ms).padStart(2, "0")}] ${text.trim()}`;
    })
    .join("\n");
}

async function fetchFromLetras(artist: string, title: string): Promise<string | null> {
  try {
    const artistSlug = slugify(artist);
    const titleSlug = slugify(title);
    const url = `https://www.letras.mus.br/${artistSlug}/${titleSlug}/`;

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MasterView/1.0)",
        "Accept": "text/html",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    });

    if (!resp.ok) return null;

    const html = await resp.text();
    let lyrics = "";

    const lyricMatch = html.match(/<div[^>]*class="[^"]*lyric-original[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (lyricMatch) lyrics = lyricMatch[1];

    if (!lyrics) {
      const cntMatch = html.match(/<div[^>]*class="[^"]*cnt-letra[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (cntMatch) lyrics = cntMatch[1];
    }

    if (!lyrics) {
      const traMatch = html.match(/<div[^>]*class="[^"]*lyric-tra_l[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (traMatch) lyrics = traMatch[1];
    }

    if (!lyrics) return null;

    const cleaned = lyrics
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<p[^>]*>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return cleaned.length >= 10 ? cleaned : null;
  } catch {
    return null;
  }
}

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

    const params = new URLSearchParams({ artist_name: artist, track_name: title });
    if (duration) params.set('duration', duration.toString());

    let syncedLyrics: string | null = null;
    let plainLyrics: string | null = null;

    const getResp = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: { 'User-Agent': 'MasterView Player v1.0' },
    });

    if (getResp.ok) {
      const data = await getResp.json();
      syncedLyrics = data.syncedLyrics || null;
      plainLyrics = data.plainLyrics || null;
    }

    if (!syncedLyrics) {
      const searchParams = new URLSearchParams({ q: `${artist} ${title}` });
      const searchResp = await fetch(`https://lrclib.net/api/search?${searchParams.toString()}`, {
        headers: { 'User-Agent': 'MasterView Player v1.0' },
      });

      if (searchResp.ok) {
        const results = await searchResp.json();
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
      const letrasText = await fetchFromLetras(artist, title);
      if (letrasText) plainLyrics = letrasText;
    }

    // AI disabled – use simple distribution for unsynced lyrics
    if (!syncedLyrics && plainLyrics) {
      const dur = duration || 180;
      syncedLyrics = plainToLrc(plainLyrics, dur);
    }

    if (!syncedLyrics && !plainLyrics) {
      return new Response(
        JSON.stringify({ success: false, error: 'Lyrics not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, syncedLyrics, plainLyrics, aiSync: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
