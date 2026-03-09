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
    console.log("youtube-playlist called with playlistId:", playlistId);

    if (!playlistId) {
      return new Response(JSON.stringify({ error: "playlistId required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try YouTube RSS feed first
    const feedUrl = `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`;
    console.log("Fetching:", feedUrl);

    let xml = "";
    let fetchOk = false;

    try {
      const res = await fetch(feedUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
          "Accept": "application/xml, text/xml, */*",
        },
      });
      console.log("YouTube RSS status:", res.status);
      if (res.ok) {
        xml = await res.text();
        fetchOk = true;
      } else {
        const errBody = await res.text();
        console.error("YouTube RSS error body:", errBody.slice(0, 300));
      }
    } catch (fetchErr) {
      console.error("Network error:", String(fetchErr));
    }

    // Fallback: try oembed approach to at least confirm the playlist exists
    if (!fetchOk) {
      // Try noembed/oembed as a fallback — returns minimal data
      try {
        const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/playlist?list=${playlistId}&format=json`;
        const oRes = await fetch(oembedUrl);
        console.log("oembed status:", oRes.status);
        const oBody = await oRes.text();
        console.log("oembed body:", oBody.slice(0, 200));
      } catch (_) {
        // ignore
      }

      return new Response(JSON.stringify({ error: "Failed to fetch playlist", videos: [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    console.log(`Parsed ${entries.length} videos`);

    return new Response(JSON.stringify({ videos: entries }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("youtube-playlist error:", String(err));
    return new Response(JSON.stringify({ error: String(err), videos: [] }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
