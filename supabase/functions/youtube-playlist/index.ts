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
    const { playlistId } = await req.json();
    if (!playlistId) {
      return new Response(JSON.stringify({ error: "playlistId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the YouTube playlist RSS feed
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
    console.log(`Fetching playlist: ${feedUrl}`);
    
    let res: Response;
    try {
      res = await fetch(feedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Bot/1.0)",
          "Accept": "application/xml, text/xml, */*",
        },
      });
    } catch (fetchErr) {
      console.error("Network error fetching playlist:", fetchErr);
      return new Response(JSON.stringify({ error: "Network error fetching playlist", details: String(fetchErr) }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    
    if (!res.ok) {
      const body = await res.text();
      console.error(`YouTube RSS returned ${res.status}: ${body.slice(0, 500)}`);
      return new Response(JSON.stringify({ error: "Failed to fetch playlist", status: res.status }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const xml = await res.text();

    // Parse entries from XML
    const entries: { videoId: string; title: string; thumbnail: string; published: string }[] = [];
    const entryRegex = /<entry>([\s\S]*?)<\/entry>/g;
    let match;
    while ((match = entryRegex.exec(xml)) !== null) {
      const entry = match[1];
      const videoIdMatch = entry.match(/<yt:videoId>(.*?)<\/yt:videoId>/);
      const titleMatch = entry.match(/<title>(.*?)<\/title>/);
      const publishedMatch = entry.match(/<published>(.*?)<\/published>/);
      if (videoIdMatch && titleMatch) {
        const videoId = videoIdMatch[1];
        entries.push({
          videoId,
          title: titleMatch[1].replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#39;/g, "'").replace(/&quot;/g, '"'),
          thumbnail: `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
          published: publishedMatch?.[1] || "",
        });
      }
    }

    return new Response(JSON.stringify({ videos: entries }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
