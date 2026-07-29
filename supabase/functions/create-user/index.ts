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

    const token = authHeader.replace("Bearer ", "").trim();
    if (!token) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Validate caller using the user-context client (Authorization header already set)
    const { data: { user: callerUser }, error: userError } = await callerClient.auth.getUser();

    if (userError || !callerUser?.id) {
      console.error("create-user auth failed", { error: userError?.message });
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerId = callerUser.id;

    // Check admin role

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: roles } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin");

    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Acesso negado" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { action } = body;

    // CREATE USER
    if (action === "create") {
      const { email, password, nome, plano, modules } = body;
      if (!email || !password || !nome) {
        return new Response(JSON.stringify({ error: "Preencha todos os campos" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (typeof password !== "string" || password.length < 8) {
        return new Response(JSON.stringify({ error: "A senha deve ter ao menos 8 caracteres" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

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

      const newId = newUser.user!.id;
      const empresaRow: Record<string, any> = { user_id: newId, nome };
      if (typeof plano === "string" && plano.trim()) empresaRow.plano = plano.trim();

      await adminClient.from("empresa_config").insert(empresaRow);
      await adminClient.from("user_roles").insert({ user_id: newId, role: "user" });

      const keys = Array.isArray(modules)
        ? modules.filter((m: unknown) => typeof m === "string").slice(0, 200)
        : [];
      if (keys.length > 0) {
        await adminClient
          .from("client_modules")
          .upsert(
            keys.map((k: string) => ({ user_id: newId, module_key: k, enabled: true })),
            { onConflict: "user_id,module_key" },
          );
      }

      return new Response(JSON.stringify({ success: true, user_id: newId }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // UPDATE USER
    if (action === "update") {
      const { user_id, email, password, nome, ativo, plano } = body;
      if (!user_id) {
        return new Response(JSON.stringify({ error: "user_id obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Update auth (email/password) if provided
      const authUpdate: Record<string, any> = {};
      if (email) authUpdate.email = email;
      if (password) authUpdate.password = password;

      if (Object.keys(authUpdate).length > 0) {
        const { error: authErr } = await adminClient.auth.admin.updateUserById(user_id, authUpdate);
        if (authErr) {
          return new Response(JSON.stringify({ error: authErr.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      // Update empresa_config fields
      const configUpdate: Record<string, any> = {};
      if (nome !== undefined) configUpdate.nome = nome;
      if (ativo !== undefined) configUpdate.ativo = ativo;
      if (plano !== undefined) configUpdate.plano = plano;

      if (Object.keys(configUpdate).length > 0) {
        const { error: configErr } = await adminClient
          .from("empresa_config")
          .update(configUpdate)
          .eq("user_id", user_id);

        if (configErr) {
          return new Response(JSON.stringify({ error: configErr.message }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // GET USER EMAIL
    if (action === "get_email") {
      const { user_id } = body;
      const { data, error } = await adminClient.auth.admin.getUserById(user_id);
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ email: data.user.email }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // LIST ALL USER EMAILS
    if (action === "list_emails") {
      const { data, error } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const emailMap: Record<string, string> = {};
      for (const u of data.users) {
        emailMap[u.id] = u.email || "";
      }
      return new Response(JSON.stringify({ emails: emailMap }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const hardDeleteClient = async (user_id: string) => {
      const { data: subs } = await adminClient
        .from("sub_users")
        .select("id, auth_user_id")
        .eq("parent_user_id", user_id);

      for (const s of subs || []) {
        if (s.auth_user_id) {
          await adminClient.from("user_roles").delete().eq("user_id", s.auth_user_id);
          await adminClient.from("profiles").delete().eq("user_id", s.auth_user_id);
          await adminClient.auth.admin.deleteUser(s.auth_user_id).catch(() => {});
        }
      }
      await adminClient.from("sub_users").delete().eq("parent_user_id", user_id);
      await adminClient.from("client_modules").delete().eq("user_id", user_id);
      await adminClient.from("empresa_config").delete().eq("user_id", user_id);
      await adminClient.from("user_roles").delete().eq("user_id", user_id);
      await adminClient.from("profiles").delete().eq("user_id", user_id);
      await adminClient.from("client_trash").delete().eq("user_id", user_id);
      const { error } = await adminClient.auth.admin.deleteUser(user_id);
      return error?.message || null;
    };

    // DELETE CLIENT -> move to trash (60 days) or purge permanently
    if (action === "delete_client" || action === "purge_client") {
      const { user_id, permanent } = body;
      if (!user_id || typeof user_id !== "string") {
        return new Response(JSON.stringify({ error: "user_id obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (user_id === callerId) {
        return new Response(JSON.stringify({ error: "Você não pode excluir o próprio usuário" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (action === "purge_client" || permanent === true) {
        const errMsg = await hardDeleteClient(user_id);
        if (errMsg) {
          return new Response(JSON.stringify({ error: errMsg }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ success: true, purged: true }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Soft delete: keep data for 60 days
      const { data: authUser } = await adminClient.auth.admin.getUserById(user_id);
      const { data: empresa } = await adminClient
        .from("empresa_config")
        .select("nome")
        .eq("user_id", user_id)
        .maybeSingle();

      const purgeAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();
      const { error: trashErr } = await adminClient.from("client_trash").upsert(
        {
          user_id,
          email: authUser?.user?.email ?? null,
          nome: empresa?.nome ?? null,
          deleted_by: callerId,
          deleted_at: new Date().toISOString(),
          purge_at: purgeAt,
        },
        { onConflict: "user_id" },
      );
      if (trashErr) {
        return new Response(JSON.stringify({ error: trashErr.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await adminClient.from("empresa_config").update({ ativo: false }).eq("user_id", user_id);
      await adminClient.from("sub_users").update({ ativo: false }).eq("parent_user_id", user_id);
      await adminClient.auth.admin
        .updateUserById(user_id, { ban_duration: "876000h" })
        .catch(() => {});

      const { data: subsBan } = await adminClient
        .from("sub_users")
        .select("auth_user_id")
        .eq("parent_user_id", user_id);
      for (const s of subsBan || []) {
        if (s.auth_user_id) {
          await adminClient.auth.admin
            .updateUserById(s.auth_user_id, { ban_duration: "876000h" })
            .catch(() => {});
        }
      }

      return new Response(JSON.stringify({ success: true, purge_at: purgeAt }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // RESTORE CLIENT FROM TRASH
    if (action === "restore_client") {
      const { user_id } = body;
      if (!user_id || typeof user_id !== "string") {
        return new Response(JSON.stringify({ error: "user_id obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      await adminClient.auth.admin.updateUserById(user_id, { ban_duration: "none" }).catch(() => {});
      await adminClient.from("empresa_config").update({ ativo: true }).eq("user_id", user_id);

      const { data: subsUnban } = await adminClient
        .from("sub_users")
        .select("auth_user_id")
        .eq("parent_user_id", user_id);
      for (const s of subsUnban || []) {
        if (s.auth_user_id) {
          await adminClient.auth.admin
            .updateUserById(s.auth_user_id, { ban_duration: "none" })
            .catch(() => {});
        }
      }

      await adminClient.from("client_trash").delete().eq("user_id", user_id);

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // LIST TRASH (auto purges expired entries)
    if (action === "list_trash") {
      const nowIso = new Date().toISOString();
      const { data: expired } = await adminClient
        .from("client_trash")
        .select("user_id")
        .lt("purge_at", nowIso);
      for (const row of expired || []) {
        await hardDeleteClient(row.user_id).catch(() => null);
      }

      const { data: items, error } = await adminClient
        .from("client_trash")
        .select("user_id, email, nome, deleted_at, purge_at")
        .order("deleted_at", { ascending: false });
      if (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ items: items || [] }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }


    // ADMIN: UPDATE SUB-USER (modules / ativo)
    if (action === "admin_sub_update") {
      const { sub_user_id, allowed_modules, ativo } = body;
      if (!sub_user_id || typeof sub_user_id !== "string") {
        return new Response(JSON.stringify({ error: "sub_user_id obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const patch: Record<string, any> = {};
      if (Array.isArray(allowed_modules)) {
        patch.allowed_modules = allowed_modules
          .filter((m: unknown) => typeof m === "string")
          .slice(0, 200);
      }
      if (typeof ativo === "boolean") patch.ativo = ativo;
      if (Object.keys(patch).length === 0) {
        return new Response(JSON.stringify({ error: "Nada para atualizar" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { error } = await adminClient.from("sub_users").update(patch).eq("id", sub_user_id);
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

    // ADMIN: DELETE SUB-USER
    if (action === "admin_sub_delete") {
      const { sub_user_id } = body;
      if (!sub_user_id || typeof sub_user_id !== "string") {
        return new Response(JSON.stringify({ error: "sub_user_id obrigatório" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const { data: sub } = await adminClient
        .from("sub_users")
        .select("auth_user_id")
        .eq("id", sub_user_id)
        .maybeSingle();

      await adminClient.from("sub_users").delete().eq("id", sub_user_id);
      if (sub?.auth_user_id) {
        await adminClient.from("user_roles").delete().eq("user_id", sub.auth_user_id);
        await adminClient.from("profiles").delete().eq("user_id", sub.auth_user_id);
        await adminClient.auth.admin.deleteUser(sub.auth_user_id).catch(() => {});
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
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
