import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type ResolveResult = { url: string; provider: string; isClip?: boolean };
type ClipResponseResult = { response: Response; provider: string };

const YOUTUBE_DOWNLOAD_INFO_HOST = "youtube-download-info-api.p.rapidapi.com";
const CLOUD_API_HUB_HOST = "cloud-api-hub-youtube-downloader.p.rapidapi.com";
const YT_VIDEO_AUDIO_HOST = "yt-video-audio-downloader-api.p.rapidapi.com";

function trimLog(value: string, max = 350) {
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

function toClock(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function qualityToHeight(quality?: string | number) {
  if (typeof quality === "number") {
    if (quality <= 2_500_000) return 360;
    if (quality <= 7_000_000) return 720;
    return 1080;
  }
  switch (quality) {
    case "low": return 360;
    case "high":
    case "max": return 1080;
    case "balanced":
    default: return 720;
  }
}

function isUsableMediaUrl(url: string) {
  try {
    const parsed = new URL(url);
    if (!/^https?:$/.test(parsed.protocol)) return false;
    const lower = url.toLowerCase();
    if (lower.includes("youtube.com/watch") || lower.includes("youtu.be/")) return false;
    if (lower.includes("img.youtube.com") || lower.match(/\.(jpg|jpeg|png|webp)(\?|$)/)) return false;
    return true;
  } catch {
    return false;
  }
}

function collectUrls(value: unknown, urls: string[] = [], depth = 0) {
  if (depth > 7 || value == null) return urls;

  if (typeof value === "string") {
    const direct = value.match(/^https?:\/\/[^\s"'<>]+/i)?.[0];
    if (direct && isUsableMediaUrl(direct)) urls.push(direct);

    const embedded = value.match(/https?:\/\/[^\s"'<>]+/gi) || [];
    for (const item of embedded) {
      const clean = item.replace(/[),.;]+$/, "");
      if (isUsableMediaUrl(clean)) urls.push(clean);
    }
    return urls;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectUrls(item, urls, depth + 1);
    return urls;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const priority = entries.sort(([a], [b]) => {
      const ak = a.toLowerCase();
      const bk = b.toLowerCase();
      const ascore = /(download|file|media|url|link|stream)/.test(ak) ? 0 : 1;
      const bscore = /(download|file|media|url|link|stream)/.test(bk) ? 0 : 1;
      return ascore - bscore;
    });
    for (const [, item] of priority) collectUrls(item, urls, depth + 1);
  }

  return urls;
}

function pickBestUrl(value: unknown) {
  const unique = [...new Set(collectUrls(value))];
  return unique.sort((a, b) => {
    const score = (url: string) => {
      const lower = url.toLowerCase();
      let total = 0;
      if (lower.includes(".mp4") || lower.includes("mime=video")) total -= 40;
      if (lower.includes("download") || lower.includes("file")) total -= 20;
      if (lower.includes("googlevideo") || lower.includes("videoplayback")) total -= 10;
      if (lower.includes("m3u8")) total += 20;
      return total;
    };
    return score(a) - score(b);
  })[0] || "";
}

async function parseResponseForUrl(res: Response, provider: string, originalUrl: string): Promise<string> {
  const contentType = res.headers.get("content-type") || "";
  const finalUrl = res.url || "";

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.log(`${provider} non-ok: ${res.status} ${trimLog(text)}`);
    return "";
  }

  if (finalUrl && finalUrl !== originalUrl && isUsableMediaUrl(finalUrl)) {
    return finalUrl;
  }

  const text = await res.text().catch(() => "");
  if (contentType.includes("application/json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
    try {
      const data = JSON.parse(text);
      return pickBestUrl(data);
    } catch (e) {
      console.log(`${provider} JSON parse error:`, (e as Error).message);
    }
  }

  return pickBestUrl(text);
}

async function responseToClipDownload(
  res: Response,
  provider: string,
  originalUrl: string,
  rapidHeaders: Record<string, string>,
): Promise<ClipResponseResult | null> {
  const contentType = res.headers.get("content-type") || "";
  const finalUrl = res.url || "";

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.log(`${provider} clip non-ok: ${res.status} ${trimLog(text)}`);
    return null;
  }

  if (
    contentType.startsWith("video/") ||
    contentType.includes("application/octet-stream") ||
    contentType.includes("application/mp4") ||
    (finalUrl && finalUrl !== originalUrl && isUsableMediaUrl(finalUrl) && !contentType.includes("json") && !contentType.includes("html"))
  ) {
    return { response: res, provider };
  }

  const text = await res.text().catch(() => "");
  let data: unknown = text;
  if (contentType.includes("application/json") || text.trim().startsWith("{") || text.trim().startsWith("[")) {
    try { data = JSON.parse(text); } catch (e) { console.log(`${provider} clip JSON parse error:`, (e as Error).message); }
  }

  const url = pickBestUrl(data);
  if (!url) return null;

  try {
    const mediaUrl = new URL(url);
    const needsRapidHeaders = mediaUrl.hostname.endsWith("rapidapi.com") || mediaUrl.hostname.includes(".p.rapidapi.com");
    const mediaRes = await fetch(url, {
      headers: needsRapidHeaders ? rapidHeaders : { "Accept": "video/mp4, application/octet-stream, */*" },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    if (!mediaRes.ok) {
      console.log(`${provider} media non-ok: ${mediaRes.status} ${trimLog(await mediaRes.text().catch(() => ""))}`);
      return null;
    }
    return { response: mediaRes, provider };
  } catch (e) {
    console.log(`${provider} media fetch error:`, (e as Error).message);
    return null;
  }
}

async function fetchRapidApiClipResponse(
  rapidKey: string,
  videoId: string,
  startSeconds: number,
  endSeconds: number,
  quality?: string | number,
): Promise<ClipResponseResult | null> {
  const height = qualityToHeight(quality);
  const rapidHeaders = {
    "Accept": "application/json, video/mp4, application/octet-stream, */*",
    "Content-Type": "application/json",
    "X-RapidAPI-Key": rapidKey,
    "X-RapidAPI-Host": CLOUD_API_HUB_HOST,
  };

  const attempts: Array<{ provider: string; url: URL }> = [];
  const baseUrl = new URL(`https://${CLOUD_API_HUB_HOST}/mux`);
  baseUrl.searchParams.set("id", videoId);
  baseUrl.searchParams.set("codec", "h264");
  baseUrl.searchParams.set("audioFormat", "best");
  baseUrl.searchParams.set("language", "en");
  baseUrl.searchParams.set("quality", String(height));
  baseUrl.searchParams.set("startTime", String(Math.floor(startSeconds * 1000)));
  baseUrl.searchParams.set("endTime", String(Math.floor(endSeconds * 1000)));
  attempts.push({ provider: "rapidapi:cloud-api-hub-clip-ms", url: baseUrl });

  const clockUrl = new URL(baseUrl.toString());
  clockUrl.searchParams.set("startTime", toClock(startSeconds));
  clockUrl.searchParams.set("endTime", toClock(endSeconds));
  attempts.push({ provider: "rapidapi:cloud-api-hub-clip-clock", url: clockUrl });

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        headers: rapidHeaders,
        redirect: "follow",
        signal: AbortSignal.timeout(30_000),
      });
      const clip = await responseToClipDownload(res, attempt.provider, attempt.url.toString(), rapidHeaders);
      if (clip) return clip;
    } catch (e) {
      console.log(`${attempt.provider} clip error:`, (e as Error).message);
    }
  }

  return null;
}

async function resolveRapidApiClip(
  rapidKey: string,
  videoId: string,
  youtubeUrl: string,
  startSeconds: number,
  endSeconds: number,
  quality?: string | number,
): Promise<ResolveResult | null> {
  const height = qualityToHeight(quality);
  const attempts: Array<{ provider: string; url: URL; init: RequestInit }> = [];

  const cloudUrl = new URL(`https://${CLOUD_API_HUB_HOST}/mux`);
  cloudUrl.searchParams.set("id", videoId);
  cloudUrl.searchParams.set("codec", "h264");
  cloudUrl.searchParams.set("audioFormat", "best");
  cloudUrl.searchParams.set("language", "en");
  cloudUrl.searchParams.set("quality", String(height));
  cloudUrl.searchParams.set("startTime", String(Math.floor(startSeconds * 1000)));
  cloudUrl.searchParams.set("endTime", String(Math.floor(endSeconds * 1000)));
  attempts.push({
    provider: "rapidapi:cloud-api-hub-clip-ms",
    url: cloudUrl,
    init: {
      headers: {
        "Accept": "application/json, video/mp4, */*",
        "Content-Type": "application/json",
        "X-RapidAPI-Key": rapidKey,
        "X-RapidAPI-Host": CLOUD_API_HUB_HOST,
      },
    },
  });

  const cloudClockUrl = new URL(cloudUrl.toString());
  cloudClockUrl.searchParams.set("startTime", toClock(startSeconds));
  cloudClockUrl.searchParams.set("endTime", toClock(endSeconds));
  attempts.push({
    provider: "rapidapi:cloud-api-hub-clip-clock",
    url: cloudClockUrl,
    init: attempts[0].init,
  });

  for (const attempt of attempts) {
    try {
      const res = await fetch(attempt.url, {
        ...attempt.init,
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
      const url = await parseResponseForUrl(res, attempt.provider, attempt.url.toString());
      if (url) return { url, provider: attempt.provider, isClip: true };
    } catch (e) {
      console.log(`${attempt.provider} error:`, (e as Error).message);
    }
  }

  // Fallback RapidAPI providers return a full MP4 when clip generation is unavailable.
  const infoUrl = new URL(`https://${YOUTUBE_DOWNLOAD_INFO_HOST}/api/download`);
  infoUrl.searchParams.set("format", String(height));
  infoUrl.searchParams.set("url", youtubeUrl);
  try {
    const res = await fetch(infoUrl, {
      headers: {
        "Accept": "application/json, */*",
        "Content-Type": "application/json",
        "X-RapidAPI-Key": rapidKey,
        "X-RapidAPI-Host": YOUTUBE_DOWNLOAD_INFO_HOST,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    const url = await parseResponseForUrl(res, "rapidapi:youtube-download-info", infoUrl.toString());
    if (url) return { url, provider: "rapidapi:youtube-download-info", isClip: false };
  } catch (e) {
    console.log("rapidapi:youtube-download-info error:", (e as Error).message);
  }

  try {
    const downloadRes = await fetch(`https://${YT_VIDEO_AUDIO_HOST}/v1/download`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "X-RapidAPI-Key": rapidKey,
        "X-RapidAPI-Host": YT_VIDEO_AUDIO_HOST,
      },
      body: JSON.stringify({ url: youtubeUrl, format: "mp4", quality: height }),
      signal: AbortSignal.timeout(20_000),
    });
    const raw = await downloadRes.text();
    if (!downloadRes.ok) {
      console.log(`rapidapi:yt-video-audio non-ok: ${downloadRes.status} ${trimLog(raw)}`);
    } else {
      let data: any = {};
      try { data = JSON.parse(raw); } catch { data = raw; }
      const direct = pickBestUrl(data);
      if (direct) return { url: direct, provider: "rapidapi:yt-video-audio", isClip: false };

      const jobId = data?.jobId || data?.id || data?.job_id;
      if (jobId) {
        for (let i = 0; i < 5; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1_200));
          const statusRes = await fetch(`https://${YT_VIDEO_AUDIO_HOST}/v1/status/${encodeURIComponent(jobId)}`, {
            headers: {
              "Accept": "application/json",
              "X-RapidAPI-Key": rapidKey,
              "X-RapidAPI-Host": YT_VIDEO_AUDIO_HOST,
            },
            signal: AbortSignal.timeout(10_000),
          });
          const statusUrl = await parseResponseForUrl(statusRes, "rapidapi:yt-video-audio-status", `https://${YT_VIDEO_AUDIO_HOST}/v1/status/${jobId}`);
          if (statusUrl) return { url: statusUrl, provider: "rapidapi:yt-video-audio-status", isClip: false };
        }
      }
    }
  } catch (e) {
    console.log("rapidapi:yt-video-audio error:", (e as Error).message);
  }

  return null;
}

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

    const { youtube_url, start_seconds, end_seconds, quality, action } = await req.json();

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

    if (action === "download_clip") {
      const rapidKey = Deno.env.get("RAPIDAPI_KEY") || "";
      if (!rapidKey) {
        return new Response(JSON.stringify({ error: "Serviço de download do YouTube não está configurado." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const clip = await fetchRapidApiClipResponse(
        rapidKey,
        videoId,
        Number(start_seconds),
        Number(end_seconds),
        quality,
      );

      if (!clip) {
        return new Response(JSON.stringify({ error: "Não foi possível gerar o arquivo do trecho selecionado para este vídeo." }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      console.log(`Streaming clip download via: ${clip.provider} for video ${videoId}`);
      const headers = new Headers(clip.response.headers);
      for (const [key, value] of Object.entries(corsHeaders)) headers.set(key, value);
      const originalContentType = headers.get("Content-Type") || "video/mp4";
      headers.set("X-Original-Content-Type", originalContentType);
      headers.set("Content-Type", "application/octet-stream");
      headers.set("Content-Disposition", `attachment; filename="youtube_${videoId}_${Math.floor(Number(start_seconds))}-${Math.floor(Number(end_seconds))}.mp4"`);
      headers.set("X-Download-Provider", clip.provider);
      return new Response(clip.response.body, { status: 200, headers });
    }

    // Try multiple providers to resolve a direct MP4/stream URL. RapidAPI is preferred
    // because it can return the selected clip; public providers usually return full-video streams.
    let downloadUrl = "";
    let providerUsed = "";
    let isClipDownload = false;

    const rapidKey = Deno.env.get("RAPIDAPI_KEY") || "";
    if (rapidKey) {
      const rapidResult = await resolveRapidApiClip(
        rapidKey,
        videoId,
        youtube_url,
        Number(start_seconds),
        Number(end_seconds),
        quality,
      );
      if (rapidResult?.url) {
        downloadUrl = rapidResult.url;
        providerUsed = rapidResult.provider;
        isClipDownload = !!rapidResult.isClip;
      }
    } else {
      console.log("RAPIDAPI_KEY not configured; skipping RapidAPI clip providers");
    }

    // 2) Piped instances (open source YT frontend, no auth)
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
          isClipDownload = false;
        }
      } catch (e) {
        console.log(`Piped ${base} error:`, (e as Error).message);
      }
    }

    // 3) Invidious instances
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
            isClipDownload = false;
          }
        } catch (e) {
          console.log(`Invidious ${base} error:`, (e as Error).message);
        }
      }
    }

    // 4) Cobalt (last resort — usually requires JWT now)
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
            isClipDownload = false;
          } else if (cobaltData.status === "picker" && Array.isArray(cobaltData.picker)) {
            const mp4 = cobaltData.picker.find((p: any) => p.type === "video") || cobaltData.picker[0];
            downloadUrl = mp4?.url || "";
            providerUsed = "cobalt-picker";
            isClipDownload = false;
          }
        } else {
          console.log("Cobalt API non-ok:", cobaltRes.status, await cobaltRes.text());
        }
      } catch (cobaltErr) {
        console.log("Cobalt API error (non-fatal):", (cobaltErr as Error).message);
      }
    }

    console.log(`Resolved download URL via: ${providerUsed || "none"} for video ${videoId} clip=${isClipDownload}`);


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
        download_url: isClipDownload ? downloadUrl : "",
        fallback_download_url: isClipDownload ? "" : downloadUrl,
        download_provider: providerUsed,
        is_clip_download: isClipDownload,
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
