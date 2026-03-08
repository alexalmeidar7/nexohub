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

    // Try to get a direct download URL via cobalt.tools API
    let downloadUrl = "";
    try {
      const cobaltRes = await fetch("https://api.cobalt.tools/", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          url: `https://www.youtube.com/watch?v=${videoId}`,
          videoQuality: "720",
          filenameStyle: "basic",
        }),
      });

      if (cobaltRes.ok) {
        const cobaltData = await cobaltRes.json();
        if (cobaltData.status === "stream" || cobaltData.status === "redirect") {
          downloadUrl = cobaltData.url || "";
        } else if (cobaltData.status === "picker" && Array.isArray(cobaltData.picker)) {
          const mp4 = cobaltData.picker.find((p: any) => p.type === "video") || cobaltData.picker[0];
          downloadUrl = mp4?.url || "";
        }
      } else {
        const errText = await cobaltRes.text();
        console.log("Cobalt API non-ok:", cobaltRes.status, errText);
      }
    } catch (cobaltErr) {
      console.log("Cobalt API error (non-fatal):", cobaltErr);
    }

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
