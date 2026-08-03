import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, radio_user_id } = await req.json().catch(() => ({}));
    const normalizedEmail = typeof email === "string" ? email.trim().toLowerCase() : "";

    if (!normalizedEmail) {
      return new Response(JSON.stringify({ ok: false, exists: false, error: "email_required" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    let query = admin
      .from("ouvintes")
      .select("id, nome, email, cpf, telefone, setor, cidade, data_nascimento, sexo, pontuacao, user_id")
      .ilike("email", normalizedEmail)
      .limit(1);

    if (typeof radio_user_id === "string" && radio_user_id) {
      query = query.eq("user_id", radio_user_id);
    }

    const { data, error } = await query;

    if (error) {
      console.error("check-listener-registration error:", error.message);
      return new Response(JSON.stringify({ ok: false, exists: false, error: error.message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const row = data?.[0] ?? null;

    return new Response(
      JSON.stringify({
        ok: true,
        exists: !!row,
        listener: row
          ? {
              nome: row.nome ?? null,
              email: row.email ?? null,
              cpf: row.cpf ?? null,
              telefone: row.telefone ?? null,
              setor: row.setor ?? null,
              cidade: row.cidade ?? null,
              data_nascimento: row.data_nascimento ?? null,
              sexo: row.sexo ?? null,
              pontuacao: row.pontuacao ?? 0,
            }
          : null,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("check-listener-registration exception:", e);
    return new Response(JSON.stringify({ ok: false, exists: false, error: String(e) }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
