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

async function resolvePublicMusicData(settings: {
  music_xml_url?: string | null;
  dashboard_items?: Record<string, any> | null;
}) {
  const dashboardItems = settings.dashboard_items ?? null;
  let musicData: MusicPayload | null = null;
  let musicStartTime: number | null = typeof dashboardItems?.music_start_time === "number"
    ? dashboardItems.music_start_time
    : null;

  if (dashboardItems?.music_current_title && dashboardItems.music_current_title !== "Sem título") {
    musicData = {
      titulo: dashboardItems.music_current_title,
      artista: dashboardItems.music_current_artist || "",
      capa: dashboardItems.music_current_cover || "",
    };
  }

  if (settings.music_xml_url) {
    try {
      const xmlResp = await fetch(settings.music_xml_url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; PublicPlayer/1.0)",
          Accept: "application/xml, text/xml, */*",
        },
        signal: AbortSignal.timeout(3000),
      });

      if (xmlResp.ok) {
        const xmlText = await xmlResp.text();
        const extractTag = (...tags: string[]) => {
          for (const tag of tags) {
            const match = xmlText.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
            if (match?.[1]?.trim()) return match[1].trim();
          }
          return "";
        };

        const titulo = extractTag("nome_musica", "titulo", "title");
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

        if (titulo && titulo.toLowerCase() !== "sem título" && titulo.toLowerCase() !== "sem titulo") {
          musicData = {
            titulo,
            artista: artista || musicData?.artista || "Desconhecido",
            capa: capa || musicData?.capa || "",
            horario: horario || undefined,
            duracao: duracao || undefined,
          };
        }
      }
    } catch {
    }
  }

  return { musicData, musicStartTime };
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

    if (profileError) {
      throw profileError;
    }

    if (!matchedProfile?.user_id) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = matchedProfile.user_id;

    if (section === "now_playing") {
      const { data: settingsData, error: settingsError } = await supabase
        .from("user_settings")
        .select("music_xml_url, dashboard_items")
        .eq("user_id", userId)
        .maybeSingle();

      if (settingsError) throw settingsError;

      const { musicData, musicStartTime } = await resolvePublicMusicData(settingsData ?? {});

      return new Response(
        JSON.stringify({
          musica: musicData?.titulo || "",
          artista: musicData?.artista || "",
          capa: musicData?.capa || "",
          duracao: musicData?.duracao || 0,
          horario: musicData?.horario || "",
          musicData,
          musicStartTime,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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
    const { musicData, musicStartTime } = await resolvePublicMusicData(settingsRes.data ?? {});

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
        musicData,
        musicStartTime,
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
