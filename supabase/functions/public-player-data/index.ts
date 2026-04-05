import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type MusicPayload = {
  titulo: string;
  artista: string;
  capa: string;
  horario?: string;
  duracao?: number;
};

/**
 * Fast path: read music from dashboard_items (DB only, no external fetch).
 * Returns null when dashboard_items has no valid music.
 */
function readMusicFromDashboard(dashboardItems: Record<string, any> | null) {
  if (!dashboardItems?.music_current_title) return null;
  const title = dashboardItems.music_current_title;
  if (title === "Sem título" || title === "Sem titulo") return null;
  return {
    musicData: {
      titulo: title,
      artista: dashboardItems.music_current_artist || "",
      capa: dashboardItems.music_current_cover || "",
    } as MusicPayload,
    musicStartTime: typeof dashboardItems.music_start_time === "number"
      ? dashboardItems.music_start_time
      : null,
  };
}

function mergeMusicPayload(primary: MusicPayload | null, fallback: MusicPayload | null): MusicPayload | null {
  if (!primary) return fallback;
  if (!fallback) return primary;

  return {
    titulo: primary.titulo,
    artista: primary.artista || fallback.artista,
    capa: primary.capa || fallback.capa,
    horario: primary.horario || fallback.horario,
    duracao: primary.duracao || fallback.duracao,
  };
}

/**
 * Slow path: fetch XML from external URL (used as fallback only).
 */
async function fetchMusicFromXml(xmlUrl: string): Promise<MusicPayload | null> {
  try {
    const xmlResp = await fetch(xmlUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PublicPlayer/1.0)",
        Accept: "application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(1500),
    });
    if (!xmlResp.ok) return null;
    const xmlText = await xmlResp.text();

    const extractTag = (...tags: string[]) => {
      for (const tag of tags) {
        const match = xmlText.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
        if (match?.[1]?.trim()) return match[1].trim();
      }
      return "";
    };

    const titulo = extractTag("nome_musica", "titulo", "title");
    if (!titulo || titulo.toLowerCase() === "sem título" || titulo.toLowerCase() === "sem titulo") return null;

    const artista = extractTag("interprete", "nome_interprete", "artista", "artist");
    const capa = extractTag("capa", "cover", "album_art", "artwork", "imagem");
    const horario = extractTag("horario");
    const duracaoRaw = extractTag("duracao", "duration");
    let duracao = 0;

    if (duracaoRaw.includes(":")) {
      const parts = duracaoRaw.split(":").map(Number);
      if (parts.length === 2) duracao = parts[0] * 60 + parts[1];
      else if (parts.length === 3) duracao = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else {
      duracao = parseFloat(duracaoRaw) || 0;
      if (duracao > 600) duracao = duracao / 1000;
    }

    return { titulo, artista: artista || "Desconhecido", capa, horario: horario || undefined, duracao: duracao || undefined };
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const reqUrl = new URL(req.url);
    let slug: string | null = null;
    let section: string | null = null;

    if (req.method === "GET") {
      slug = reqUrl.searchParams.get("slug");
      section = reqUrl.searchParams.get("section");
    } else if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      slug = typeof body?.slug === "string" ? body.slug : null;
      section = typeof body?.section === "string" ? body.section : null;
    } else {
      return new Response(JSON.stringify({ error: "method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!slug || typeof slug !== "string") {
      return new Response(JSON.stringify({ error: "slug is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const slugLower = slug.toLowerCase();
    const { data: matchedProfile, error: profileError } = await supabase
      .from("profiles")
      .select("user_id, email")
      .ilike("email", `${slugLower}@%`)
      .limit(1)
      .maybeSingle();

    if (profileError) throw profileError;

    if (!matchedProfile?.user_id) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = matchedProfile.user_id;

    // ── FAST PATH: now_playing ──────────────────────────────────────
    if (section === "now_playing") {
      const { data: settingsData, error: settingsError } = await supabase
        .from("user_settings")
        .select("music_xml_url, dashboard_items")
        .eq("user_id", userId)
        .maybeSingle();

      if (settingsError) throw settingsError;

      const dashboardItems = (settingsData?.dashboard_items ?? null) as Record<string, any> | null;

      const dbMusic = readMusicFromDashboard(dashboardItems);
      let musicData = dbMusic?.musicData ?? null;

      // If the DB snapshot still has no cover, try to enrich it from XML before returning.
      if ((!musicData || !musicData.capa) && settingsData?.music_xml_url) {
        const xmlMusic = await fetchMusicFromXml(settingsData.music_xml_url);
        musicData = mergeMusicPayload(musicData, xmlMusic);
      }

      return new Response(
        JSON.stringify({
          musica: musicData?.titulo || "",
          artista: musicData?.artista || "",
          capa: musicData?.capa || "",
          duracao: musicData?.duracao || 0,
          horario: musicData?.horario || "",
          musicData,
          musicStartTime: dbMusic?.musicStartTime ?? (typeof dashboardItems?.music_start_time === "number" ? dashboardItems.music_start_time : null),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── FULL BOOTSTRAP ──────────────────────────────────────────────
    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    const [channelsRes, programasRes, apresentadoresRes, prerollRes, empresaRes, shopRes, settingsRes] =
      await Promise.all([
        supabase.from("streaming_channels").select("*").eq("user_id", userId).eq("active", true).order("numero_canal"),
        supabase.from("programas").select("id, nome, horario_inicio, horario_fim, dias_semana, ativo, selo, estudio, variavel, data_variavel, capa, thumb, descricao, classificacao_etaria, apresentador_id, apresentadores_ids").eq("user_id", userId).eq("ativo", true).ilike("estudio", "%fm%").order("horario_inicio"),
        supabase.from("apresentadores").select("id, nome, foto, instagram").eq("user_id", userId).eq("ativo", true),
        supabase.from("comercial_preroll").select("*").eq("user_id", userId).eq("active", true).lte("horario_inicio", currentTime).gte("horario_fim", currentTime).order("priority", { ascending: true }),
        supabase.from("empresa_config").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("shopping_products").select("id, name, description, image_url, price, stock, program_id, payment_url").eq("user_id", userId).eq("active", true).gt("stock", 0),
        supabase.from("user_settings").select("shopping_active, music_xml_url, dashboard_items").eq("user_id", userId).maybeSingle(),
      ]);

    const isShopActive = settingsRes.data?.shopping_active !== false;
    const dashboardItems = (settingsRes.data?.dashboard_items ?? null) as Record<string, any> | null;

    // Try dashboard first, fallback to XML
    let musicResult = readMusicFromDashboard(dashboardItems);
    if (!musicResult?.musicData && settingsRes.data?.music_xml_url) {
      const xmlMusic = await fetchMusicFromXml(settingsRes.data.music_xml_url);
      if (xmlMusic) {
        musicResult = {
          musicData: xmlMusic,
          musicStartTime: typeof dashboardItems?.music_start_time === "number" ? dashboardItems.music_start_time : null,
        };
      }
    }

    return new Response(
      JSON.stringify({
        userId,
        channels: channelsRes.data || [],
        programas: programasRes.data || [],
        apresentadores: apresentadoresRes.data || [],
        prerolls: prerollRes.data || [],
        empresa: empresaRes.data || null,
        shopProducts: isShopActive ? (shopRes.data || []) : [],
        shopActive: isShopActive,
        musicData: musicResult?.musicData || null,
        musicStartTime: musicResult?.musicStartTime || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
