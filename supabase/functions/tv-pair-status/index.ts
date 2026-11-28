import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

// Retorna o status de um cÃ³digo de pareamento SOMENTE para a prÃ³pria TV
// que criou o cÃ³digo (validado por tv_session_id). Substitui a leitura
// pÃºblica direta da tabela tv_pairing_codes.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  try {
    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    const tvSessionId = typeof body?.tvSessionId === "string" ? body.tvSessionId.trim().slice(0, 128) : "";
    const isToken = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code);
    if ((!isToken && !/^\d{4}$/.test(code)) || !tvSessionId) return json({ ok: false, reason: "invalid_params" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data } = await admin
      .from("tv_pairing_codes")
      .select("status, paired_user_id, paired_email, paired_name, paired_avatar, expires_at, tv_session_id")
      .eq("code", code)
      .maybeSingle();

    if (!data || data.tv_session_id !== tvSessionId) return json({ ok: false, reason: "not_found" });

    return json({
      ok: true,
      row: {
        status: data.status,
        paired_user_id: data.paired_user_id,
        paired_email: data.paired_email,
        paired_name: data.paired_name,
        paired_avatar: data.paired_avatar,
        expires_at: data.expires_at,
      },
    });
  } catch (e) {
    console.error("[tv-pair-status] error:", e);
    return json({ ok: false, reason: "server_error" });
  }
});

