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
    deezerArtistImg: (dashboardItems.music_deezer_artist_img as string) || "",
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

    const isUUID = (str: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
    
    let userId: string | null = null;
    let matchedProfile: any = null;

    if (isUUID(slug)) {
      userId = slug;
      // We still need the email for prefix matching logic if we want to be fully backward compatible, 
      // but for bootstrap we mostly need the userId.
    } else {
      const slugLower = slug.toLowerCase().trim();

      // Regra de resolução ESTRITA e DETERMINÍSTICA — nunca mistura donos.
      // A ordem de precedência garante que o mesmo slug sempre resolve o mesmo user_id.
      //
      // 1) Match exato do local-part do email em profiles: "slug@..."
      //    Ex.: slug "positivafm" -> "positivafm@positivafm.com.br"
      let { data, error: profileError } = await supabase
        .from("profiles")
        .select("user_id, email")
        .ilike("email", `${slugLower}@%`)
        .order("email", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (profileError) {
        // Retry curto: falhas momentâneas do banco não devem derrubar o player
        await new Promise((r) => setTimeout(r, 400));
        const retry = await supabase.from("profiles").select("user_id, email")
          .ilike("email", `${slugLower}@%`).order("email", { ascending: true }).limit(1).maybeSingle();
        if (retry.error) throw retry.error;
        data = retry.data;
      }

      // 2) Match exato do local-part em sub_users: resolve para o pai (herança)
      if (!data?.user_id) {
        const { data: sub } = await supabase
          .from("sub_users")
          .select("auth_user_id, parent_user_id, ativo")
          .ilike("email", `${slugLower}@%`)
          .order("email", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (sub?.auth_user_id) {
          userId = (sub.ativo && sub.parent_user_id) ? sub.parent_user_id : sub.auth_user_id;
        }
      }

      // 3) Prefix largo em profiles: "slug*@..." — ordenado por email para determinismo
      //    Ex.: slug "interativafm" -> "interativafmgynaovivo@gmail.com"
      //    IMPORTANTE: NÃO usar substring livre (%slug%) — isso já causou
      //    o slug "interativafm" resolver para "opec@interativafm.net" (dono errado).
      if (!userId && !data?.user_id) {
        const { data: d3 } = await supabase
          .from("profiles")
          .select("user_id, email")
          .ilike("email", `${slugLower}%@%`)
          .order("email", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (d3?.user_id) data = d3 as any;
      }

      // 4) Prefix largo em sub_users
      if (!userId && !data?.user_id) {
        const { data: sub2 } = await supabase
          .from("sub_users")
          .select("auth_user_id, parent_user_id, ativo, email")
          .ilike("email", `${slugLower}%@%`)
          .order("email", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (sub2?.auth_user_id) {
          userId = (sub2.ativo && sub2.parent_user_id) ? sub2.parent_user_id : sub2.auth_user_id;
        }
      }

      if (!userId && data?.user_id) {
        userId = data.user_id;
        matchedProfile = data;
      }

      console.log(`[public-player-data] slug="${slugLower}" -> userId=${userId ?? "null"}`);
    }


    if (!userId) {
      console.log(`[public-player-data] User not found for slug="${slug}" section="${section}"`);
      return new Response(JSON.stringify({ error: "User not found", slug }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // ── FAST PATH: active mid-rolls for public Top 10 playback ──────
    if (section === "active_midrolls") {
      const now = new Date();
      const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
      const { data, error } = await supabase
        .from("comercial_preroll")
        .select("*")
        .eq("user_id", userId)
        .eq("active", true)
        .lte("horario_inicio", currentTime)
        .gte("horario_fim", currentTime)
        .eq("is_midroll", true)
        .order("priority", { ascending: true });

      if (error) console.warn("[public-player-data] midrolls error:", error.message);

      return new Response(JSON.stringify({ userId, prerolls: data || [], ...(error ? { ok: false, partial: true } : {}) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── FAST PATH: now_playing ──────────────────────────────────────
    if (section === "now_playing") {
      const { data: settingsData, error: settingsError } = await supabase
        .from("user_settings")
        .select("music_xml_url, dashboard_items")
        .eq("user_id", userId)
        .maybeSingle();

      if (settingsError) console.warn("[public-player-data] now_playing error:", settingsError.message);

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
          userId,
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

    // Try dashboard first, and enrich missing cover from XML when needed
    let musicResult = readMusicFromDashboard(dashboardItems);
    const deezerArtistImgFromDash = (dashboardItems?.music_deezer_artist_img as string) || "";
    if ((!musicResult?.musicData || !musicResult.musicData.capa) && settingsRes.data?.music_xml_url) {
      const xmlMusic = await fetchMusicFromXml(settingsRes.data.music_xml_url);
      const mergedMusic = mergeMusicPayload(musicResult?.musicData ?? null, xmlMusic);
      if (mergedMusic) {
        musicResult = {
          musicData: mergedMusic,
          musicStartTime: typeof dashboardItems?.music_start_time === "number" ? dashboardItems.music_start_time : null,
          deezerArtistImg: deezerArtistImgFromDash,
        };
      }
    }

    // Encontra locutor do programa NO AR agora no fuso da emissora
    const stationTz = empresaRes.data?.timezone || "America/Sao_Paulo";
    let localHour = now.getUTCHours();
    let localMin = now.getUTCMinutes();
    let diaAtual = "";
    let todayStr = "";
    try {
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: stationTz,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour12: false,
      });
      const parts = fmt.formatToParts(now);
      const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
      const wdMap: Record<string, string> = {
        Sun: "Domingo", Mon: "Segunda", Tue: "Terça", Wed: "Quarta", Thu: "Quinta", Fri: "Sexta", Sat: "Sábado"
      };
      const hRaw = parseInt(get("hour"), 10);
      localHour = Number.isFinite(hRaw) ? hRaw % 24 : localHour;
      localMin = parseInt(get("minute"), 10) || localMin;
      diaAtual = wdMap[get("weekday")] || "Segunda";
      todayStr = `${get("year")}-${get("month")}-${get("day")}`;
    } catch {
      const dayNames = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
      diaAtual = dayNames[now.getDay()];
      todayStr = now.toISOString().slice(0, 10);
    }
    const localTime = `${String(localHour).padStart(2, "0")}:${String(localMin).padStart(2, "0")}`;

    const currentProgram = (programasRes.data || []).find((p: any) => {
      const ini = String(p.horario_inicio || "").slice(0, 5);
      const fim = String(p.horario_fim || "").slice(0, 5);
      if (!ini || !fim) return false;
      const inRange = ini <= fim ? (localTime >= ini && localTime <= fim) : (localTime >= ini || localTime <= fim);
      if (!inRange) return false;
      if (p.variavel) return p.data_variavel === todayStr;
      const dias = Array.isArray(p.dias_semana) ? p.dias_semana : [];
      return dias.includes(diaAtual);
    });
    const presenterIds: string[] = currentProgram
      ? (Array.isArray(currentProgram.apresentadores_ids) && currentProgram.apresentadores_ids.length
          ? currentProgram.apresentadores_ids
          : (currentProgram.apresentador_id ? [currentProgram.apresentador_id] : []))
      : [];
    const currentPresenter = presenterIds.length
      ? (apresentadoresRes.data || []).find((a: any) => a.id === presenterIds[0])
      : null;

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
        musicDeezerArtistImg: musicResult?.deezerArtistImg || deezerArtistImgFromDash || null,
        playerTvColor: String(dashboardItems?.player_colors?.tvPrimaryColor || "#dc2626"),
        currentProgram: currentProgram || null,
        currentPresenter: currentPresenter ? { id: currentPresenter.id, nome: currentPresenter.nome, foto: currentPresenter.foto } : null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[public-player-data] fatal:", err);
    return new Response(JSON.stringify({ ok: false, error: "Dados temporariamente indisponíveis", retryable: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
