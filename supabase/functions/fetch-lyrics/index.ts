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

// Use AI to generate intelligent timestamps for lyrics
async function aiSyncLyrics(plainLyrics: string, artist: string, title: string, durationSec: number): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.log("LOVABLE_API_KEY not available, falling back to simple sync");
    return null;
  }

  try {
    const systemPrompt = `You are a music lyrics timing expert. Your task is to generate LRC (synced lyrics) timestamps for song lyrics.

RULES:
1. Output ONLY valid LRC format lines, one per line
2. Format: [mm:ss.xx] Lyric text
3. Consider natural song structure: intro, verse, chorus, bridge, outro
4. Account for instrumental sections and pauses between verses
5. Vocals typically start 5-15 seconds into a song
6. Choruses are usually faster-paced than verses
7. Leave appropriate gaps for instrumental breaks
8. Each line should have realistic timing based on how long it takes to sing

IMPORTANT: Return ONLY the LRC formatted lyrics, nothing else. No explanations, no markdown.`;

    const userPrompt = `Generate synced LRC lyrics for this song:

Artist: ${artist}
Title: ${title}
Total Duration: ${durationSec} seconds

Plain Lyrics:
${plainLyrics}

Generate LRC timestamps that sync naturally with how this song would be performed. Consider the tempo and style typical for this artist/genre.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      console.error(`AI gateway error: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const lrcOutput = data.choices?.[0]?.message?.content?.trim();

    if (!lrcOutput) {
      console.log("AI returned empty response");
      return null;
    }

    // Validate LRC format - check if it has valid timestamps
    const hasValidLrc = /\[\d{2}:\d{2}\.\d{2,3}\]/.test(lrcOutput);
    if (!hasValidLrc) {
      console.log("AI output is not valid LRC format");
      return null;
    }

    console.log(`AI generated ${lrcOutput.split('\n').length} synced lines`);
    return lrcOutput;
  } catch (err) {
    console.error("AI sync error:", err);
    return null;
  }
}

// Simple fallback: distribute lyrics evenly
function plainToLrc(plain: string, durationSec: number): string {
  const lines = plain.split("\n").filter((l) => l.trim().length > 0);
  if (lines.length === 0) return "";

  // Reserve 8s intro, distribute rest evenly with some variance
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

    console.log(`Trying letras.mus.br: ${url}`);

    const resp = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; MasterView/1.0)",
        "Accept": "text/html",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
    });

    if (!resp.ok) {
      console.log(`letras.mus.br returned ${resp.status}`);
      return null;
    }

    const html = await resp.text();

    let lyrics = "";

    // Pattern 1: lyric-original div
    const lyricMatch = html.match(/<div[^>]*class="[^"]*lyric-original[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    if (lyricMatch) {
      lyrics = lyricMatch[1];
    }

    // Pattern 2: cnt-letra div (older layout)
    if (!lyrics) {
      const cntMatch = html.match(/<div[^>]*class="[^"]*cnt-letra[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (cntMatch) {
        lyrics = cntMatch[1];
      }
    }

    // Pattern 3: lyric-tra_l (another pattern)
    if (!lyrics) {
      const traMatch = html.match(/<div[^>]*class="[^"]*lyric-tra_l[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
      if (traMatch) {
        lyrics = traMatch[1];
      }
    }

    if (!lyrics) {
      console.log("Could not extract lyrics from letras.mus.br HTML");
      return null;
    }

    // Clean HTML tags, decode entities
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

    if (cleaned.length < 10) {
      return null;
    }

    console.log(`Found lyrics from letras.mus.br (${cleaned.length} chars)`);
    return cleaned;
  } catch (err) {
    console.error("Error fetching from letras.mus.br:", err);
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

    console.log(`Fetching lyrics for: ${artist} - ${title}`);

    // Try exact match first with GET endpoint (lrclib - synced lyrics)
    const params = new URLSearchParams({
      artist_name: artist,
      track_name: title,
    });
    if (duration) {
      params.set('duration', duration.toString());
    }

    let syncedLyrics: string | null = null;
    let plainLyrics: string | null = null;
    let usedAiSync = false;

    // Try GET (exact match)
    const getResp = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: { 'User-Agent': 'MasterView Player v1.0' },
    });

    if (getResp.ok) {
      const data = await getResp.json();
      syncedLyrics = data.syncedLyrics || null;
      plainLyrics = data.plainLyrics || null;
    }

    // Fallback to lrclib search if no synced lyrics found
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

    // Fallback to letras.mus.br if still no lyrics
    if (!syncedLyrics && !plainLyrics) {
      console.log("lrclib.net failed, trying letras.mus.br...");
      const letrasText = await fetchFromLetras(artist, title);
      if (letrasText) {
        plainLyrics = letrasText;
      }
    }

    // If we have plain lyrics but no synced, use AI to generate intelligent timestamps
    if (!syncedLyrics && plainLyrics) {
      const dur = duration || 180;
      console.log("Using AI to generate synced lyrics...");
      
      // Try AI sync first
      const aiSynced = await aiSyncLyrics(plainLyrics, artist, title, dur);
      if (aiSynced) {
        syncedLyrics = aiSynced;
        usedAiSync = true;
        console.log("Successfully generated AI-synced lyrics");
      } else {
        // Fallback to simple distribution
        syncedLyrics = plainToLrc(plainLyrics, dur);
        console.log("Used simple distribution for lyrics sync");
      }
    }

    if (!syncedLyrics && !plainLyrics) {
      return new Response(
        JSON.stringify({ success: false, error: 'Lyrics not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found lyrics: synced=${!!syncedLyrics}, plain=${!!plainLyrics}, aiSync=${usedAiSync}`);

    return new Response(
      JSON.stringify({ success: true, syncedLyrics, plainLyrics, aiSync: usedAiSync }),
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
