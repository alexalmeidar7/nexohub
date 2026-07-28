import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { queries } = await req.json() as { queries: string[] };

    if (!queries || !Array.isArray(queries) || queries.length === 0) {
      return new Response(JSON.stringify({ error: "queries array required", results: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Limit to 10 searches
    const limited = queries.slice(0, 10);

    // Search a single query with an abort timeout so a slow lookup doesn't hold the whole batch.
    const searchOne = async (query: string): Promise<{ query: string; videoId: string; title: string; thumbnail: string } | null> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query + " official video")}&sp=EgIQAQ%3D%3D`;
        const res = await fetch(searchUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8",
          },
          signal: controller.signal,
        });
        if (!res.ok) {
          console.error(`YouTube search failed for "${query}": ${res.status}`);
          return null;
        }
        const html = await res.text();
        const dataMatch = html.match(/var ytInitialData = ({.*?});<\/script>/s);
        if (dataMatch) {
          const jsonStr = dataMatch[1];
          const vidMatch = jsonStr.match(/"videoId":"([a-zA-Z0-9_-]{11})"/);
          if (vidMatch) {
            const videoId = vidMatch[1];
            const titleMatch = jsonStr.match(new RegExp(`"videoId":"${videoId}"[^}]*?"title":\\{"runs":\\[\\{"text":"(.*?)"\\}`));
            const title = titleMatch ? titleMatch[1].replace(/\\u0026/g, "&").replace(/\\"/g, '"') : query;
            return { query, videoId, title, thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` };
          }
        }
        const fallbackMatch = html.match(/\/watch\?v=([a-zA-Z0-9_-]{11})/);
        if (fallbackMatch) {
          return { query, videoId: fallbackMatch[1], title: query, thumbnail: `https://i.ytimg.com/vi/${fallbackMatch[1]}/mqdefault.jpg` };
        }
        return null;
      } catch (err) {
        console.error(`Error searching for "${query}":`, String(err));
        return null;
      } finally {
        clearTimeout(timeout);
      }
    };

    // Run all lookups in parallel — dramatically faster than the previous sequential loop.
    const settled = await Promise.all(limited.map((q) => searchOne(q)));
    const results = settled.filter((r): r is { query: string; videoId: string; title: string; thumbnail: string } => !!r);

    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("youtube-search error:", String(err));
    return new Response(JSON.stringify({ error: String(err), results: [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
