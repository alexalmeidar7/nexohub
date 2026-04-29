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

    // Find user by email prefix via profiles table
    const slugLower = slug.toLowerCase();
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, email")
      .not("email", "is", null);

    const matchedProfile = (profiles || []).find((p: any) =>
      p.email && p.email.split("@")[0].toLowerCase() === slugLower
    );

    if (!matchedProfile) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = matchedProfile.user_id;

    // Check if this is a sub-user and if so, use the parent's data
    const { data: subUserData } = await supabase
      .from("sub_users")
      .select("parent_user_id, ativo")
      .eq("auth_user_id", userId)
      .maybeSingle();

    const finalUserId = (subUserData?.ativo && subUserData.parent_user_id) 
      ? subUserData.parent_user_id 
      : userId;

    const today = new Date().toISOString().split("T")[0];

    const [empresaRes, promoRes, progsRes, testRes, aprsRes, settingsRes] = await Promise.all([
      supabase.from("empresa_config").select("*").eq("user_id", finalUserId).maybeSingle(),
      supabase.from("promocoes").select("*").eq("user_id", finalUserId).order("data_inicio"),
      supabase.from("programas").select("*").eq("user_id", finalUserId).eq("ativo", true).ilike("estudio", "%fm%"),
      supabase.from("testemunhais").select("*").eq("user_id", finalUserId),
      supabase.from("apresentadores").select("*").eq("user_id", finalUserId).eq("ativo", true),
      supabase.from("user_settings").select("cenario_config").eq("user_id", finalUserId).maybeSingle(),
    ]);

    return new Response(
      JSON.stringify({
        userId,
        empresa: empresaRes.data || null,
        promocoes: promoRes.data || [],
        programas: progsRes.data || [],
        testemunhais: testRes.data || [],
        apresentadores: aprsRes.data || [],
        tela_promo_config: settingsRes.data?.cenario_config?.tela_promo_bg || null,
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
