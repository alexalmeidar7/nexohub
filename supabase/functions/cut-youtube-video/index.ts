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

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
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

    // Use cobalt API to download the specific segment
    // cobalt.tools is a free, open-source media downloader
    const cobaltResponse = await fetch("https://api.cobalt.tools/", {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url: youtube_url,
        downloadMode: "auto",
        filenameStyle: "basic",
      }),
    });

    if (!cobaltResponse.ok) {
      const errText = await cobaltResponse.text();
      console.error("Cobalt error:", errText);
      return new Response(
        JSON.stringify({ error: "Não foi possível processar o vídeo. Tente novamente." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cobaltData = await cobaltResponse.json();

    if (!cobaltData.url) {
      return new Response(
        JSON.stringify({ error: "Não foi possível obter o link de download do vídeo." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Note: Full video trimming requires ffmpeg which isn't available in edge functions.
    // We return the full video download URL. For actual trimming, a dedicated server would be needed.
    // The download link from cobalt is temporary by nature.
    return new Response(
      JSON.stringify({
        download_url: cobaltData.url,
        video_id: videoId,
        start_seconds,
        end_seconds,
        duration,
        note: "O vídeo completo está disponível para download. O corte preciso requer processamento adicional.",
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
