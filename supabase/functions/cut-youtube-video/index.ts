import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { youtube_url, start_seconds, end_seconds } = await req.json();

    if (!youtube_url || start_seconds === undefined || end_seconds === undefined) {
      return new Response(
        JSON.stringify({ error: "Parâmetros obrigatórios: youtube_url, start_seconds, end_seconds" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const duration = end_seconds - start_seconds;
    if (duration <= 0 || duration > 600) {
      return new Response(
        JSON.stringify({ error: "Duração inválida. O corte deve ter entre 1 segundo e 10 minutos." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract video ID
    const match = youtube_url.match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/
    );
    if (!match) {
      return new Response(
        JSON.stringify({ error: "URL do YouTube inválida." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const videoId = match[1];

    // Try multiple providers to resolve a direct MP4/stream URL
    let downloadUrl = "";
    let providerUsed = "";

    // 1) Piped instances (open source YT frontend, no auth)
    const pipedInstances = [
      "https://pipedapi.kavin.rocks",
      "https://pipedapi.adminforge.de",
      "https://pipedapi.leptons.xyz",
      "https://pipedapi.reallyaweso.me",
    ];
    for (const base of pipedInstances) {
      if (downloadUrl) break;
      try {
        const r = await fetch(`${base}/streams/${videoId}`, {
          headers: { "Accept": "application/json" },
          signal: AbortSignal.timeout(6000),
        });
        if (!r.ok) { console.log(`Piped ${base} non-ok:`, r.status); continue; }
        const data = await r.json();
        const videoStreams: any[] = data.videoStreams || [];
        // Prefer combined (with audio) MP4 streams
        const combined = videoStreams.filter((s) => s.videoOnly === false && (s.format || "").toLowerCase().includes("mpeg_4"));
        const pick = combined.sort((a, b) => (b.height || 0) - (a.height || 0))[0]
          || videoStreams.filter((s) => s.videoOnly === false).sort((a, b) => (b.height || 0) - (a.height || 0))[0];
        if (pick?.url) {
          downloadUrl = pick.url;
          providerUsed = `piped:${base}`;
        }
      } catch (e) {
        console.log(`Piped ${base} error:`, (e as Error).message);
      }
    }

    // 2) Invidious instances
    if (!downloadUrl) {
      const invInstances = [
        "https://yewtu.be",
        "https://invidious.privacyredirect.com",
        "https://invidious.nerdvpn.de",
        "https://iv.melmac.space",
      ];
      for (const base of invInstances) {
        if (downloadUrl) break;
        try {
          const r = await fetch(`${base}/api/v1/videos/${videoId}`, {
            headers: { "Accept": "application/json" },
            signal: AbortSignal.timeout(6000),
          });
          if (!r.ok) { console.log(`Invidious ${base} non-ok:`, r.status); continue; }
          const data = await r.json();
          const streams: any[] = data.formatStreams || [];
          const pick = streams
            .filter((s: any) => (s.container || "").toLowerCase() === "mp4")
            .sort((a: any, b: any) => (parseInt(b.resolution) || 0) - (parseInt(a.resolution) || 0))[0]
            || streams[0];
          if (pick?.url) {
            downloadUrl = pick.url;
            providerUsed = `invidious:${base}`;
          }
        } catch (e) {
          console.log(`Invidious ${base} error:`, (e as Error).message);
        }
      }
    }

    // 3) Cobalt (last resort — usually requires JWT now)
    if (!downloadUrl) {
      try {
        const cobaltRes = await fetch("https://api.cobalt.tools/", {
          method: "POST",
          headers: { "Accept": "application/json", "Content-Type": "application/json" },
          body: JSON.stringify({
            url: `https://www.youtube.com/watch?v=${videoId}`,
            videoQuality: "720",
            filenameStyle: "basic",
          }),
          signal: AbortSignal.timeout(6000),
        });
        if (cobaltRes.ok) {
          const cobaltData = await cobaltRes.json();
          if (cobaltData.status === "stream" || cobaltData.status === "redirect" || cobaltData.status === "tunnel") {
            downloadUrl = cobaltData.url || "";
            providerUsed = "cobalt";
          } else if (cobaltData.status === "picker" && Array.isArray(cobaltData.picker)) {
            const mp4 = cobaltData.picker.find((p: any) => p.type === "video") || cobaltData.picker[0];
            downloadUrl = mp4?.url || "";
            providerUsed = "cobalt-picker";
          }
        } else {
          console.log("Cobalt API non-ok:", cobaltRes.status, await cobaltRes.text());
        }
      } catch (cobaltErr) {
        console.log("Cobalt API error (non-fatal):", (cobaltErr as Error).message);
      }
    }

    console.log(`Resolved download URL via: ${providerUsed || "none"} for video ${videoId}`);


    // Generate clip embed and share URLs
    const clipEmbedUrl = `https://www.youtube.com/embed/${videoId}?start=${start_seconds}&end=${end_seconds}&autoplay=1`;
    const shareUrl = `https://youtu.be/${videoId}?t=${start_seconds}`;
    const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    return new Response(
      JSON.stringify({
        success: true,
        video_id: videoId,
        clip_embed_url: clipEmbedUrl,
        share_url: shareUrl,
        thumbnail_url: thumbnailUrl,
        download_url: downloadUrl,
        start_seconds,
        end_seconds,
        duration,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("cut-youtube-video error:", err);
    return new Response(
      JSON.stringify({ error: "Erro interno ao processar o vídeo." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
