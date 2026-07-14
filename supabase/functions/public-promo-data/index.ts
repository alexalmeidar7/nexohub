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
    const { slug } = await req.json();
    if (!slug || typeof slug !== "string") {
      return new Response(JSON.stringify({ error: "slug is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
    let userId: string | null = null;

    if (isUUID(slug)) {
      userId = slug;
    } else {
      const slugLower = slug.toLowerCase();
      // 1) Try master profile by email prefix
      const { data: matched } = await supabase
        .from("profiles")
        .select("user_id, email")
        .ilike("email", `${slugLower}@%`)
        .limit(1)
        .maybeSingle();
      if (matched?.user_id) userId = matched.user_id;

      // 2) Fallback: sub-user by email prefix — resolves to parent's data
      if (!userId) {
        const { data: sub } = await supabase
          .from("sub_users")
          .select("auth_user_id, parent_user_id, ativo, email")
          .ilike("email", `${slugLower}@%`)
          .limit(1)
          .maybeSingle();
        if (sub?.auth_user_id) userId = sub.auth_user_id;
      }

      // 3) Fallback: full email match (slug contains @)
      if (!userId && slug.includes("@")) {
        const { data: byFull } = await supabase
          .from("profiles")
          .select("user_id")
          .ilike("email", slug)
          .limit(1)
          .maybeSingle();
        if (byFull?.user_id) userId = byFull.user_id;
      }
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: "User not found", slug }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if this is a sub-user and if so, use the parent's data
    const { data: subUserData } = await supabase
      .from("sub_users")
      .select("parent_user_id, ativo, nome, email")
      .eq("auth_user_id", userId)
      .maybeSingle();

    const finalUserId = (subUserData?.ativo && subUserData.parent_user_id) 
      ? subUserData.parent_user_id 
      : userId;

    const today = new Date().toISOString().split("T")[0];

    const [empresaRes, promoRes, progsRes, testRes, aprsRes, settingsRes, ownSettingsRes, ownEmpresaRes] = await Promise.all([
      supabase.from("empresa_config").select("*").eq("user_id", finalUserId).maybeSingle(),
      supabase.from("promocoes").select("*").eq("user_id", finalUserId).order("data_inicio"),
      supabase.from("programas").select("*").eq("user_id", finalUserId).eq("ativo", true).ilike("estudio", "%fm%"),
      supabase.from("testemunhais").select("*").eq("user_id", finalUserId),
      supabase.from("apresentadores").select("*").eq("user_id", finalUserId).eq("ativo", true),
      supabase.from("user_settings").select("cenario_config, weather_city, weather_lat, weather_lon").eq("user_id", finalUserId).maybeSingle(),
      // Sub-user's own tela_promo config and empresa name take precedence over
      // parent's, so each sub-user (e.g. Jornal FM under Positiva FM) can brand
      // its own promo screen and window title.
      userId !== finalUserId
        ? supabase.from("user_settings").select("cenario_config").eq("user_id", userId).maybeSingle()
        : Promise.resolve({ data: null } as any),
      userId !== finalUserId
        ? supabase.from("empresa_config").select("nome, logo").eq("user_id", userId).maybeSingle()
        : Promise.resolve({ data: null } as any),
    ]);

    const ownTelaPromo = (ownSettingsRes as any)?.data?.cenario_config?.tela_promo_bg || null;
    const parentTelaPromo = settingsRes.data?.cenario_config?.tela_promo_bg || null;
    // Sub-users must NOT inherit parent's tela_promo background — only use their own.
    // Master users (userId === finalUserId) use their own config from settingsRes.
    const isSubUser = userId !== finalUserId;
    const telaPromoConfig = isSubUser ? ownTelaPromo : parentTelaPromo;

    // Merge empresa: keep parent's contact/streaming data, but override nome/logo
    // with sub-user's own branding when available.
    const ownEmpresa = (ownEmpresaRes as any)?.data || null;
    const subUserNome = (subUserData as any)?.nome as string | undefined;
    const empresa = empresaRes.data
      ? {
          ...empresaRes.data,
          nome: ownEmpresa?.nome || subUserNome || empresaRes.data.nome,
          logo: ownEmpresa?.logo || empresaRes.data.logo,
        }
      : (ownEmpresa || (subUserNome ? { nome: subUserNome } : null));


    return new Response(
      JSON.stringify({
        userId,
        empresa: empresa,
        promocoes: promoRes.data || [],
        programas: progsRes.data || [],
        testemunhais: testRes.data || [],
        apresentadores: aprsRes.data || [],
        tela_promo_config: telaPromoConfig,
        weather_city: settingsRes.data?.weather_city || null,
        weather_lat: settingsRes.data?.weather_lat ?? null,
        weather_lon: settingsRes.data?.weather_lon ?? null,
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
