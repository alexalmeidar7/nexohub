import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * Registra eventos de client-side do pareamento (scanned/expired/error) na
 * tabela tv_pairing_events. Não requer auth para permitir capturar acesso
 * ao QR code no celular antes do login Google.
 */
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const ua = req.headers.get("user-agent") || null;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  try {
    const body = await req.json().catch(() => ({}));
    const event = typeof body?.event === "string" ? body.event.trim() : "";
    const allowed = new Set(["scanned", "expired", "error", "code_entered"]);
    if (!allowed.has(event)) {
      return new Response(JSON.stringify({ ok: false, reason: "invalid_event" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const code = typeof body?.code === "string" && /^\d{4}$/.test(body.code.trim()) ? body.code.trim() : null;
    const userSlug = typeof body?.userSlug === "string" ? body.userSlug.toLowerCase().trim().slice(0, 128) : null;
    const tvSessionId = typeof body?.tvSessionId === "string" ? body.tvSessionId.trim().slice(0, 128) : null;
    const reason = typeof body?.reason === "string" ? body.reason.trim().slice(0, 128) : null;
    const meta = body?.meta && typeof body.meta === "object" ? body.meta : {};

    // Se veio código, hidrata slug_user_id / tv_session_id a partir do registro do pareamento.
    let slug_user_id: string | null = null;
    let resolvedSession = tvSessionId;
    let resolvedSlug = userSlug;
    if (code) {
      const { data: row } = await supabase
        .from("tv_pairing_codes")
        .select("slug_user_id, tv_session_id, user_slug")
        .eq("code", code)
        .maybeSingle();
      if (row) {
        slug_user_id = (row as any).slug_user_id || null;
        resolvedSession = resolvedSession || (row as any).tv_session_id || null;
        resolvedSlug = resolvedSlug || (row as any).user_slug || null;
      }
    }

    await supabase.from("tv_pairing_events").insert({
      event_type: event,
      reason,
      code,
      user_slug: resolvedSlug,
      slug_user_id,
      tv_session_id: resolvedSession,
      user_agent: ua,
      ip,
      meta,
    });

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("[tv-pair-track] error:", e);
    return new Response(JSON.stringify({ ok: false, reason: "server_error" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
