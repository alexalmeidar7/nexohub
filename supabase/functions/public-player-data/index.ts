import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const reqUrl = new URL(req.url);
    let slug: string | null = null;

    if (req.method === "GET") {
      slug = reqUrl.searchParams.get("slug");
    } else if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      slug = typeof body?.slug === "string" ? body.slug : null;
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

    // Resolve user quickly through the public profiles table instead of paging auth users
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

    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    // Fetch all player data in parallel
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

    let musicData: { titulo: string; artista: string; capa: string; horario?: string; duracao?: number } | null = null;
    let musicStartTime: number | null = null;
    const dashboardItems = settingsRes.data?.dashboard_items as Record<string, any> | null;

    if (dashboardItems?.music_current_title && dashboardItems.music_current_title !== "Sem título") {
      musicData = {
        titulo: dashboardItems.music_current_title,
        artista: dashboardItems.music_current_artist || "",
        capa: "",
      };
      musicStartTime = typeof dashboardItems.music_start_time === "number" ? dashboardItems.music_start_time : null;
    }

    if (!musicData && settingsRes.data?.music_xml_url) {
      try {
        const xmlResp = await fetch(settingsRes.data.music_xml_url, {
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

          if (titulo) {
            musicData = {
              titulo,
              artista: artista || "Desconhecido",
              capa: capa || "",
              horario: horario || undefined,
              duracao: duracao || undefined,
            };
          }
        }
      } catch {}
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
