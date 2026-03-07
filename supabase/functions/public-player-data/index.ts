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

    // Find user by email prefix — use filtered API call instead of listing all users
    const gotrue = `${supabaseUrl}/auth/v1/admin/users`;
    const res = await fetch(gotrue, {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
    });
    if (!res.ok) throw new Error("Failed to list users");
    const usersPayload = await res.json();
    const allUsers: any[] = usersPayload.users || usersPayload;

    const matchedUser = allUsers.find((u: any) =>
      u.email && u.email.split("@")[0].toLowerCase() === slug.toLowerCase()
    );

    if (!matchedUser) {
      // Try paginated if first page didn't match
      let page = 2;
      let found: any = null;
      const totalPages = Math.ceil((usersPayload.total || allUsers.length) / (usersPayload.per_page || 50));
      while (!found && page <= totalPages) {
        const pageRes = await fetch(`${gotrue}?page=${page}&per_page=50`, {
          headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey },
        });
        if (!pageRes.ok) break;
        const pageData = await pageRes.json();
        const pageUsers: any[] = pageData.users || pageData;
        found = pageUsers.find((u: any) => u.email && u.email.split("@")[0].toLowerCase() === slug.toLowerCase());
        page++;
      }
      if (!found) {
        return new Response(JSON.stringify({ error: "User not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      var userId = found.id;
    } else {
      var userId = matchedUser.id;
    }

    const now = new Date();
    const currentTime = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

    // Fetch all player data in parallel
    const [channelsRes, programasRes, apresentadoresRes, prerollRes, empresaRes, shopRes] =
      await Promise.all([
        supabase.from("streaming_channels").select("*").eq("user_id", userId).eq("active", true).order("numero_canal"),
        supabase.from("programas").select("id, nome, horario_inicio, horario_fim, dias_semana, ativo, selo, estudio, variavel, data_variavel, capa, descricao, apresentador_id").eq("user_id", userId).eq("ativo", true).order("horario_inicio"),
        supabase.from("apresentadores").select("id, nome, foto, instagram").eq("user_id", userId).eq("ativo", true),
        supabase.from("comercial_preroll").select("*").eq("user_id", userId).eq("active", true).lte("horario_inicio", currentTime).gte("horario_fim", currentTime).order("priority", { ascending: true }),
        supabase.from("empresa_config").select("*").eq("user_id", userId).maybeSingle(),
        supabase.from("shopping_products").select("id, name, description, image_url, price, stock, program_id, payment_url").eq("user_id", userId).eq("active", true).gt("stock", 0),
      ]);

    return new Response(
      JSON.stringify({
        userId,
        channels: channelsRes.data || [],
        programas: programasRes.data || [],
        apresentadores: apresentadoresRes.data || [],
        prerolls: prerollRes.data || [],
        empresa: empresaRes.data || null,
        shopProducts: shopRes.data || [],
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
