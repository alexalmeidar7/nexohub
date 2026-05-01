import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
const CACHE_TTL_MS = 3000; // 3s cache to keep “música no ar” responsive on external screens

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get("uid");
    const clientDay = url.searchParams.get("day");
    const clientTime = url.searchParams.get("time");

    if (!userId) {
      return new Response(JSON.stringify({ ok: false, error: "uid required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check cache first (longer TTL to survive DB outages)
    const cached = uidCache.get(userId);
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
    const nowTime = clientTime || now.toTimeString().slice(0, 5);

    // Wrap DB calls with a hard timeout to prevent 150s hangs
    const DB_TIMEOUT_MS = 8000;

    const withTimeout = <T>(promise: Promise<T>, label: string): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) =>
          setTimeout(() => reject(new Error(`DB timeout: ${label}`)), DB_TIMEOUT_MS)
        ),
      ]);

    // Parallelise independent DB reads with timeout
    const [settingsResult, progsResult] = await withTimeout(
      Promise.all([
        supabase
          .from("user_settings")
          .select("cenario_config, music_xml_url, dashboard_items")
          .eq("user_id", userId)
          .maybeSingle(),
        supabase
          .from("programas")
          .select("id, nome, selo, thumb, capa, horario_inicio, horario_fim, dias_semana, apresentador_id, apresentadores_ids, tipo_programa")
          .eq("user_id", userId)
          .eq("ativo", true),
      ]),
      "settings+progs"
    );

    const settings = settingsResult.data;
    const progs = progsResult.data;

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

    // ─── Music data: prefer dashboard_items (synced by useGlobalMusicSync) ───
    let musicData: { titulo: string; artista: string; capa: string } | null = null;
    let musicStartTime: number | null = null;

    const dashItems = (settings as any)?.dashboard_items as Record<string, any> | null;
    if (dashItems?.music_current_title && dashItems.music_current_title !== "Sem título") {
      musicData = {
        titulo: dashItems.music_current_title,
        artista: dashItems.music_current_artist || "",
        capa: dashItems.music_current_cover || "",
      };
      musicStartTime = dashItems.music_start_time || null;
    }

    // Fallback: fetch XML only if dashboard has no music
    if (!musicData) {
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
          }
        } catch { /* silent */ }
      }
    }

    // Skip musicas_tocadas fallback query to reduce DB load
    // (it was a third DB round-trip that rarely provided value)

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
    };

    // Store in cache
    uidCache.set(userId, { data: responsePayload, ts: Date.now() });
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
      if (userId) {
        const stale = uidCache.get(userId);
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
