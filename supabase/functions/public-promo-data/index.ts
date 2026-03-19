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

    // Find user by email prefix using GoTrue admin API with large page size
    const slugLower = slug.toLowerCase();
    const gotrue = `${supabaseUrl}/auth/v1/admin/users?per_page=1000`;
    const res = await fetch(gotrue, {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    });
    if (!res.ok) throw new Error("Failed to fetch users");
    const payload = await res.json();
    const allUsers: any[] = payload.users || [];

    const matchedUser = allUsers.find((u: any) =>
      u.email && u.email.split("@")[0].toLowerCase() === slugLower
    );

    if (!matchedUser) {
      return new Response(JSON.stringify({ error: "User not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = matchedUser.id;
    const today = new Date().toISOString().split("T")[0];

    const [empresaRes, promoRes, progsRes, testRes, aprsRes] = await Promise.all([
      supabase.from("empresa_config").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("promocoes").select("*").eq("user_id", userId).order("data_inicio"),
      supabase.from("programas").select("*").eq("user_id", userId).eq("ativo", true).ilike("estudio", "%fm%"),
      supabase.from("testemunhais").select("*").eq("user_id", userId),
      supabase.from("apresentadores").select("*").eq("user_id", userId).eq("ativo", true),
    ]);

    return new Response(
      JSON.stringify({
        userId,
        empresa: empresaRes.data || null,
        promocoes: promoRes.data || [],
        programas: progsRes.data || [],
        testemunhais: testRes.data || [],
        apresentadores: aprsRes.data || [],
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
