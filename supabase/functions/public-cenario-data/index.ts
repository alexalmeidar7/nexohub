import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Cache of the live video ID discovered per YouTube channel (slow HTML scrape).
const liveVideoIdCache = new Map<string, { videoId: string; at: number }>();
const LIVE_ID_CACHE_MS = 5 * 60 * 1000;
const youtubeChatCache = new Map<string, { messages: { user: string; text: string; avatar?: string }[]; at: number }>();
const YOUTUBE_CHAT_CACHE_MS = 10 * 1000;

// Simple XML text extractor
function extractTag(xml: string, ...tags: string[]): string {
  for (const tag of tags) {
    const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
    const match = xml.match(regex);
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => {
      const code = Number.parseInt(dec, 10);
      return Number.isNaN(code) ? _ : String.fromCodePoint(code);
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      const code = Number.parseInt(hex, 16);
      return Number.isNaN(code) ? _ : String.fromCodePoint(code);
    });
}

function decodeXmlBuffer(buffer: ArrayBuffer, contentType: string): string {
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(buffer);
  const charsetMatch = contentType.match(/charset=([^\s;]+)/i);
  if (charsetMatch) {
    try {
      const decoded = new TextDecoder(charsetMatch[1], { fatal: false }).decode(buffer);
      return decoded.replace(/^\uFEFF/, "");
    } catch { /* fallback */ }
  }
  const xmlMatch = utf8.match(/<\?xml[^>]+encoding=["']([^"']+)["']/i);
  if (xmlMatch) {
    try {
      const decoded = new TextDecoder(xmlMatch[1], { fatal: false }).decode(buffer);
      return decoded.replace(/^\uFEFF/, "");
    } catch { /* fallback */ }
  }
  return utf8.replace(/^\uFEFF/, "");
}

// Simple in-memory cache per uid (absorb request bursts)
const uidCache = new Map<string, { data: any; ts: number }>();
const CACHE_TTL_MS = 5000; // Absorve polling sincronizado sem atrasar a atualização visual.

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("uid");
    const clientDay = url.searchParams.get("day");
    const clientTime = url.searchParams.get("time");
    const clientDate = url.searchParams.get("date");

    if (!userId) {
      return new Response(JSON.stringify({ ok: false, error: "uid required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create a composite cache key that includes the videoId if chat is enabled
    // This prevents serving old chat messages when the user changes the URL
    const ytUrlParam = url.searchParams.get("ytUrl") || "";
    const cacheKey = [userId, clientDate || "", clientDay || "", clientTime?.slice(0, 5) || "", ytUrlParam].join(":");
    const cached = uidCache.get(cacheKey);
    
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return new Response(JSON.stringify(cached.data), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-cache" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey, {
      db: { schema: "public" },
      global: {
        headers: { "x-connection-timeout": "5000" }, // hint for connection pool
      },
    });

    const now = new Date();
    const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
    const today = clientDay || dayNames[now.getDay()];
    const todayDate = clientDate || new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(now);
    const nowTime = clientTime || now.toTimeString().slice(0, 5);

    // Wrap DB calls with a hard timeout to prevent 150s hangs
    const DB_TIMEOUT_MS = 8000;

    const withTimeout = <T>(promise: PromiseLike<T>, label: string): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`DB timeout: ${label}`)), DB_TIMEOUT_MS)
        ),
      ]);

    // Parallelise independent DB reads with timeout
    const [settingsResult, progsResult, enquetesResult] = await withTimeout(
      Promise.all([
        supabase
          .from("user_settings")
          .select("cenario_config, music_xml_url, dashboard_items")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("programas")
          .select("id, nome, selo, thumb, capa, horario_inicio, horario_fim, dias_semana, apresentador_id, apresentadores_ids, tipo_programa, estudio")
          .eq("user_id", userId)
          .eq("ativo", true)
          // Cenários externos devem refletir SOMENTE a grade do estúdio FM
          // (ignora podcasts/TV e outros estúdios).
          .ilike("estudio", "%fm%"),
        supabase
          .from("enquetes_agendadas")
          .select("id, data_enquete, horario_inicio, horario_fim, pergunta, resposta1, resposta2, resposta3, resposta4, resposta_correta")
          .eq("user_id", userId)
          .eq("data_enquete", todayDate)
          .order("horario_inicio", { ascending: true }),
      ]),
      "settings+progs+enquetes"
    );

    const settings = settingsResult.data;
    const progs = progsResult.data;
    const enquetes = enquetesResult.data;

    let currentProgram = null;
    let sponsorLogos: any[] = [];

    const onAir = progs?.find(
      (p: any) =>
        (p.dias_semana || []).includes(today) &&
        p.horario_inicio <= nowTime &&
        p.horario_fim > nowTime
    );

    // Prepare parallel fetches for on-air program details
    if (onAir) {
      const apIds = onAir.apresentadores_ids?.length
        ? onAir.apresentadores_ids
        : onAir.apresentador_id
        ? [onAir.apresentador_id]
        : [];

      const [apsResult, logosResult] = await withTimeout(
        Promise.all([
          apIds.length
            ? supabase.from("apresentadores").select("nome, foto, instagram").in("id", apIds)
            : Promise.resolve({ data: null }),
          supabase
            .from("logos_patrocinadores")
            .select("id, nome, logo_url")
            .eq("programa_id", onAir.id)
            .eq("user_id", userId)
            .eq("ativo", true)
            .eq("excluido", false),
        ]),
        "aps+logos"
      );

      const apresentadorNome = apsResult.data?.map((a: any) => a.nome).join(", ") || "";
      const apresentadoresFotos = (apsResult.data || []).map((a: any) => a.foto).filter((f: any) => !!f);
      const apresentadorFoto = apresentadoresFotos[0] || "";
      const apresentadorInstagram = apsResult.data?.map((a: any) => a.instagram).filter((i: any) => !!i).join(", ") || "";

      currentProgram = {
        nome: onAir.nome,
        id: onAir.id,
        selo: onAir.selo,
        thumb: onAir.thumb || null,
        capa: onAir.capa || null,
        horario_inicio: onAir.horario_inicio,
        horario_fim: onAir.horario_fim,
        apresentador: apresentadorNome,
        apresentadorFoto,
        apresentadoresFotos,
        apresentadorInstagram,
        tipo_programa: onAir.tipo_programa || null,
      };

      sponsorLogos = logosResult.data || [];
    }

    // ─── Music data: prefer LIVE XML (authoritative source) over cached dashboard_items ───
    // The DB cache in dashboard_items is only refreshed by useGlobalMusicSync running
    // in the master user's browser. If nobody is online, it stays stuck on the last
    // track ever seen. The XML feed is updated by the radio automation continuously,
    // so it must be preferred whenever available.
    let musicData: { titulo: string; artista: string; capa: string } | null = null;
    let musicStartTime: number | null = null;
    const dashItems = (settings as any)?.dashboard_items as Record<string, any> | null;
    const xmlUrl = (settings as any)?.music_xml_url;

    if (xmlUrl) {
      try {
        const xmlResp = await fetch(xmlUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; MusicMonitor/1.0)", Accept: "application/xml, text/xml, */*" },
          signal: AbortSignal.timeout(3000),
        });
        const buffer = await xmlResp.arrayBuffer();
        const text = decodeXmlBuffer(buffer, xmlResp.headers.get("content-type") || "");

        const titulo = decodeHtmlEntities(extractTag(text, "nome_musica", "titulo", "title")).trim();
        const artista = decodeHtmlEntities(extractTag(text, "interprete", "nome_interprete", "artista", "artist")).trim();
        const capa = extractTag(text, "capa", "cover", "album_art", "artwork", "imagem").trim();

        if (titulo && titulo !== "Sem título") {
          musicData = { titulo, artista, capa };
          // If the XML track matches the cached one, keep the cached start time so
          // the elapsed counter stays consistent across polls.
          if (
            dashItems?.music_current_title === titulo &&
            (dashItems?.music_current_artist || "") === artista
          ) {
            musicStartTime = dashItems?.music_start_time || null;
          }
        }
      } catch { /* silent */ }
    }

    // Fallback to cached dashboard_items when XML is unavailable or empty
    if (!musicData && dashItems?.music_current_title && dashItems.music_current_title !== "Sem título") {
      musicData = {
        titulo: dashItems.music_current_title,
        artista: dashItems.music_current_artist || "",
        capa: dashItems.music_current_cover || "",
      };
      musicStartTime = dashItems.music_start_time || null;
    }

    // ─── YouTube Chat data: scrape live chat from channel auto-discovery ───
    let youtubeChatMessages: { user: string; text: string; avatar?: string }[] = [];
    
    // Fetch empresa_config to get youtube_channel_id or legacy youtube URL
    const { data: empresaConfig } = await withTimeout(
      supabase
        .from("empresa_config")
        .select("youtube, youtube_channel_id")
        .eq("user_id", userId)
        .maybeSingle(),
      "empresa_config"
    );

    let videoId: string | null = null;
    const channelId = empresaConfig?.youtube_channel_id;
    const youtubeUrl = empresaConfig?.youtube;

    if (channelId) {
      // Reuse a recently discovered live video ID: YouTube HTML pages are slow
      // and frequently exceed the request budget, which used to leave the chat empty.
      const cached = liveVideoIdCache.get(channelId);
      if (cached && Date.now() - cached.at < LIVE_ID_CACHE_MS) {
        videoId = cached.videoId;
      }

      if (!videoId) {
        for (const timeoutMs of [9000, 9000]) {
          try {
            const r = await fetch(`https://www.youtube.com/channel/${channelId}/live?_t=${Date.now()}`, {
              headers: { "User-Agent": "Mozilla/5.0" },
              signal: AbortSignal.timeout(timeoutMs),
            });
            if (r.ok) {
              const text = await r.text();
              const m = text.match(/\"videoId\":\"([a-zA-Z0-9_-]{11})\"/);
              if (m?.[1]) {
                videoId = m[1];
              } else {
                // Secondary regex for videoId in case of different response structure
                const m2 = text.match(/\\\"videoId\\\":\\\"([a-zA-Z0-9_-]{11})\\\"/);
                if (m2?.[1]) videoId = m2[1];
              }
            }
            if (videoId) break;
          } catch (err) {
            console.error("YouTube live ID discovery error:", err);
          }
        }
      }

      if (videoId) {
        liveVideoIdCache.set(channelId, { videoId, at: Date.now() });
      } else if (cached) {
        videoId = cached.videoId; // stale but better than an empty chat
      }
    } else if (youtubeUrl) {
      // Fallback to URL parsing if channel ID is not set
      const m1 = youtubeUrl.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      const m2 = youtubeUrl.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/);
      const m3 = youtubeUrl.match(/\/live\/([a-zA-Z0-9_-]{11})/);
      videoId = m1?.[1] || m2?.[1] || m3?.[1];
    }

    if (videoId) {
      const cachedChat = youtubeChatCache.get(videoId);
      if (cachedChat && Date.now() - cachedChat.at < YOUTUBE_CHAT_CACHE_MS) {
        youtubeChatMessages = cachedChat.messages;
      } else {
      try {
        console.log(`Fetching YouTube chat for discovered videoId: ${videoId}`);
        const ytResp = await fetch(`https://www.youtube.com/live_chat?v=${videoId}&_t=${Date.now()}`, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
          },
          signal: AbortSignal.timeout(12000),
        });

        if (ytResp.ok) {
          const html = await ytResp.text();
          const actionsMatch = html.match(/\"addChatItemAction\":\{.*?\"text\":\"(.*?)\".*?\"authorName\":\{.*?\"simpleText\":\"(.*?)\"/g);
          
          if (!actionsMatch) {
            // Try another format for live chat actions
            const moreActions = html.match(/\"addChatItemAction\":\{.*?\"runs\":\[\{.*?\"text\":\"(.*?)\".*?\].*?\"authorName\":\{.*?\"simpleText\":\"(.*?)\"/g);
            if (moreActions) {
              youtubeChatMessages = moreActions.map(act => {
                const msgMatch = act.match(/\"runs\":\[\{.*?\"text\":\"(.*?)\"/);
                const authorMatch = act.match(/\"simpleText\":\"(.*?)\"/);
                const text = msgMatch ? msgMatch[1].replace(/\\u0026/gi, '&').replace(/\\"/g, '"') : "";
                const user = authorMatch ? authorMatch[1].replace(/\\u0026/gi, '&').replace(/\\"/g, '"') : "Usuário";
                return { user, text };
              }).filter(m => m.text);
            }
          }

          if (actionsMatch) {
            youtubeChatMessages = actionsMatch.map(act => {
              const msgMatch = act.match(/\"text\":\"(.*?)\"/);
              const authorMatch = act.match(/\"simpleText\":\"(.*?)\"/);
              const text = msgMatch ? msgMatch[1].replace(/\\u0026/g, '&').replace(/\\"/g, '"') : "";
              const user = authorMatch ? authorMatch[1].replace(/\\u0026/g, '&').replace(/\\"/g, '"') : "Usuário";
              return { user, text };
            }).filter(m => m.text && m.text.length > 0 && !m.text.includes("Welcome to live chat"));
            youtubeChatMessages = youtubeChatMessages.slice(-20);
          } else {
            const runActions = html.match(/\"authorName\":\{.*?\"simpleText\":\"(.*?)\".*?\"runs\":\[\{.*?\"text\":\"(.*?)\"/g);
            if (runActions) {
              youtubeChatMessages = runActions.map(act => {
                const authorMatch = act.match(/\"simpleText\":\"(.*?)\"/);
                const msgMatch = act.match(/\"runs\":\[\{.*?\"text\":\"(.*?)\"/);
                const user = authorMatch ? authorMatch[1] : "Usuário";
                const text = msgMatch ? msgMatch[1] : "";
                return { user, text };
              }).filter(m => m.text && m.text.length > 0);
              youtubeChatMessages = youtubeChatMessages.slice(-20);
            }
          }
        }
      } catch (err) {
        console.error("YouTube chat fetch error:", err);
        if (cachedChat) youtubeChatMessages = cachedChat.messages;
      }
      if (youtubeChatMessages.length > 0) {
        youtubeChatCache.set(videoId, { messages: youtubeChatMessages, at: Date.now() });
      } else if (cachedChat) {
        youtubeChatMessages = cachedChat.messages;
      }
      }
    }

    // Find next program
    let nextProgram: { nome: string; selo?: string | null; horario_inicio: string; horario_fim: string } | null = null;
    if (progs) {
      const upcoming = progs
        .filter((p: any) => (p.dias_semana || []).includes(today) && p.horario_inicio > nowTime)
        .sort((a: any, b: any) => a.horario_inicio.localeCompare(b.horario_inicio));
      if (upcoming.length > 0) {
        const np = upcoming[0];
        nextProgram = { nome: np.nome, selo: np.selo, horario_inicio: np.horario_inicio, horario_fim: np.horario_fim };
      }
    }

    const accentColor = dashItems?.layout_colors?.accentColor || null;

    const responsePayload = {
      ok: true,
      cenario_config: (settings as any)?.cenario_config || {},
      currentProgram,
      nextProgram,
      sponsorLogos,
      musicData,
      musicStartTime,
      accentColor,
      musicXmlUrl: (settings as any)?.music_xml_url || null,
      youtubeChatMessages: youtubeChatMessages.length > 0 ? youtubeChatMessages : null,
      enquetes: enquetes || [],
    };

    // Store in cache
    uidCache.set(cacheKey, { data: responsePayload, ts: Date.now() });
    // Evict old entries
    if (uidCache.size > 100) {
      const cutoff = Date.now() - CACHE_TTL_MS * 2;
      for (const [k, v] of uidCache) { if (v.ts < cutoff) uidCache.delete(k); }
    }

    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-cache" },
    });
  } catch (err) {
    // On DB timeout, serve stale cache if available
    try {
      const url = new URL(req.url);
      const userId = url.searchParams.get("uid");
      const ytUrlParam = url.searchParams.get("ytUrl") || "";
      const cacheKey = [
        userId || "",
        url.searchParams.get("date") || "",
        url.searchParams.get("day") || "",
        (url.searchParams.get("time") || "").slice(0, 5),
        ytUrlParam,
      ].join(":");
      if (userId) {
        const stale = uidCache.get(cacheKey) || uidCache.get(userId);
        if (stale) {
          return new Response(JSON.stringify({ ...stale.data, _stale: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    } catch { /* ignore */ }

    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
