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

    // Call RapidAPI YouTube downloader
    const RAPIDAPI_KEY = Deno.env.get("RAPIDAPI_KEY");
    if (!RAPIDAPI_KEY) {
      return new Response(
        JSON.stringify({ error: "Chave da API não configurada. Entre em contato com o suporte." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiResponse = await fetch(
      `https://youtube-search-download3.p.rapidapi.com/download?video=${videoId}`,
      {
        method: "GET",
        headers: {
          "x-rapidapi-key": RAPIDAPI_KEY,
          "x-rapidapi-host": "youtube-search-download3.p.rapidapi.com",
        },
      }
    );

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      console.error("RapidAPI error:", apiResponse.status, errText);
      return new Response(
        JSON.stringify({ error: "Falha ao buscar link de download do vídeo." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const apiData = await apiResponse.json();

    // Extract download links - try to find mp4 formats
    let downloadUrl = "";
    let quality = "";

    // The API typically returns video formats in a links or similar structure
    // Adapt based on actual API response
    if (apiData?.video) {
      // Try to get best quality mp4
      const videos = Array.isArray(apiData.video) ? apiData.video : [];
      const mp4 = videos.find((v: any) => v.mimeType?.includes("video/mp4") && v.quality === "720p")
        || videos.find((v: any) => v.mimeType?.includes("video/mp4") && v.quality === "360p")
        || videos.find((v: any) => v.mimeType?.includes("video/mp4"))
        || videos[0];
      if (mp4) {
        downloadUrl = mp4.url || mp4.downloadUrl || "";
        quality = mp4.quality || mp4.qualityLabel || "";
      }
    }

    // Fallback: check other common response structures
    if (!downloadUrl && apiData?.links) {
      const links = Array.isArray(apiData.links) ? apiData.links : [];
      const mp4Link = links.find((l: any) => l.mimeType?.includes("mp4") || l.extension === "mp4")
        || links[0];
      if (mp4Link) {
        downloadUrl = mp4Link.url || mp4Link.link || "";
        quality = mp4Link.quality || "";
      }
    }

    // Another common pattern
    if (!downloadUrl && apiData?.url) {
      downloadUrl = apiData.url;
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
        download_quality: quality,
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
