import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validate caller
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: callerUser }, error: userError } = await callerClient.auth.getUser();
    if (userError || !callerUser?.id) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parentId = callerUser.id;
    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const body = await req.json();
    const { action } = body;

    // CREATE SUB-USER
    if (action === "create") {
      const { email, password, nome } = body;
      if (!email || !password) {
        return new Response(JSON.stringify({ error: "Email e senha são obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Create auth user
      const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      if (createError) {
        return new Response(JSON.stringify({ error: createError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const authUserId = newUser.user!.id;

      // Insert sub_users record
      const { error: insertError } = await adminClient.from("sub_users").insert({
        parent_user_id: parentId,
        auth_user_id: authUserId,
        email,
        nome: nome || "",
        allowed_modules: [],
        ativo: true,
      });

      if (insertError) {
        // Cleanup: delete the auth user if sub_users insert fails
        await adminClient.auth.admin.deleteUser(authUserId);
        return new Response(JSON.stringify({ error: insertError.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Also give user role
      await adminClient.from("user_roles").insert({ user_id: authUserId, role: "user" });

      return new Response(JSON.stringify({ success: true, id: authUserId }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // UPDATE SUB-USER MODULES
    if (action === "update_modules") {
      const { sub_user_id, allowed_modules } = body;
      if (!sub_user_id) {
        return new Response(JSON.stringify({ error: "sub_user_id obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await adminClient
        .from("sub_users")
        .update({ allowed_modules: allowed_modules || [] })
        .eq("id", sub_user_id)
        .eq("parent_user_id", parentId);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // UPDATE SUB-USER PASSWORD
    if (action === "update_password") {
      const { auth_user_id, password } = body;
      if (!auth_user_id || !password) {
        return new Response(JSON.stringify({ error: "auth_user_id e password obrigatórios" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Verify this sub-user belongs to the caller
      const { data: sub } = await adminClient
        .from("sub_users")
        .select("id")
        .eq("auth_user_id", auth_user_id)
        .eq("parent_user_id", parentId)
        .maybeSingle();

      if (!sub) {
        return new Response(JSON.stringify({ error: "Sub-usuário não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await adminClient.auth.admin.updateUserById(auth_user_id, { password });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // DELETE SUB-USER
    if (action === "delete") {
      const { sub_user_id } = body;
      if (!sub_user_id) {
        return new Response(JSON.stringify({ error: "sub_user_id obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Get auth_user_id first
      const { data: sub } = await adminClient
        .from("sub_users")
        .select("auth_user_id")
        .eq("id", sub_user_id)
        .eq("parent_user_id", parentId)
        .maybeSingle();

      if (!sub) {
        return new Response(JSON.stringify({ error: "Sub-usuário não encontrado" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete from sub_users
      await adminClient.from("sub_users").delete().eq("id", sub_user_id);
      // Delete auth user
      await adminClient.auth.admin.deleteUser(sub.auth_user_id);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // TOGGLE ATIVO
    if (action === "toggle_ativo") {
      const { sub_user_id, ativo } = body;
      if (!sub_user_id) {
        return new Response(JSON.stringify({ error: "sub_user_id obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await adminClient
        .from("sub_users")
        .update({ ativo })
        .eq("id", sub_user_id)
        .eq("parent_user_id", parentId);

      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Ação inválida" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
