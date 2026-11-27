import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);
  const ua = req.headers.get("user-agent") || null;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const logEvent = (row: Record<string, unknown>) =>
    admin.from("tv_pairing_events").insert({ user_agent: ua, ip, ...row }).then(() => {}, () => {});
  try {
    const body = await req.json().catch(() => ({}));
    const guest = body?.guest === true;
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();

    let user: any = null;
    if (!guest) {
      if (!jwt) {
        await logEvent({ event_type: "error", reason: "not_authenticated" });
        return new Response(JSON.stringify({ ok: false, reason: "not_authenticated" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Cliente com JWT do usuário para validar auth.
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      });
      const { data: userData, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userData?.user) {
        await logEvent({ event_type: "error", reason: "invalid_session" });
        return new Response(JSON.stringify({ ok: false, reason: "invalid_session" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      user = userData.user;
    }

    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!/^\d{4}$/.test(code)) {
      await logEvent({ event_type: "error", reason: "invalid_code", paired_user_id: user?.id, paired_email: user?.email, meta: { guest } });
      return new Response(JSON.stringify({ ok: false, reason: "invalid_code" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: row } = await admin
      .from("tv_pairing_codes")
      .select("code, status, expires_at, user_slug, slug_user_id, tv_session_id")
      .eq("code", code)
      .maybeSingle();

    if (!row) {
      await logEvent({ event_type: "error", reason: "code_not_found", code, paired_user_id: user?.id, paired_email: user?.email, meta: { guest } });
      return new Response(JSON.stringify({ ok: false, reason: "code_not_found" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (row.status !== "pending") {
      await logEvent({ event_type: "error", reason: "code_already_used", code, user_slug: row.user_slug, slug_user_id: row.slug_user_id, tv_session_id: row.tv_session_id, paired_user_id: user?.id, paired_email: user?.email, meta: { guest } });
      return new Response(JSON.stringify({ ok: false, reason: "code_already_used" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await admin.from("tv_pairing_codes").update({ status: "expired" }).eq("code", code);
      await logEvent({ event_type: "expired", reason: "code_expired_on_claim", code, user_slug: row.user_slug, slug_user_id: row.slug_user_id, tv_session_id: row.tv_session_id, paired_user_id: user?.id, paired_email: user?.email, meta: { guest } });
      return new Response(JSON.stringify({ ok: false, reason: "code_expired" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const meta = (user?.user_metadata || {}) as Record<string, any>;
    const paired_name = guest ? "Visitante" : String(meta.full_name || meta.name || meta.given_name || user?.email?.split("@")[0] || "").trim() || null;
    const paired_avatar = guest ? "/avatars/usr-default.png" : String(meta.avatar_url || meta.picture || "").trim() || null;

    const { data: updated, error: updErr } = await admin
      .from("tv_pairing_codes")
      .update({
        status: "claimed",
        paired_user_id: guest ? null : user.id,
        paired_email: guest ? null : user.email,
        paired_name,
        paired_avatar,
        claimed_at: new Date().toISOString(),
      })
      .eq("code", code).eq("status", "pending").gt("expires_at",new Date().toISOString()).select("code").maybeSingle();

    if (updErr || !updated) {
      console.error("[tv-pair-claim] update error:", updErr);
      await logEvent({ event_type: "error", reason: "update_failed", code, user_slug: row.user_slug, slug_user_id: row.slug_user_id, tv_session_id: row.tv_session_id, paired_user_id: user?.id, paired_email: user?.email, meta: { error: String(updErr.message || updErr), guest } });
      return new Response(JSON.stringify({ ok: false, reason: "update_failed" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await logEvent({ event_type: "claimed", code, user_slug: row.user_slug, slug_user_id: row.slug_user_id, tv_session_id: row.tv_session_id, paired_user_id: user?.id, paired_email: user?.email, meta: { paired_name, guest } });

    return new Response(JSON.stringify({ ok: true, userSlug: row.user_slug }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[tv-pair-claim] error:", e);
    await logEvent({ event_type: "error", reason: "server_error", meta: { error: String((e as any)?.message || e) } });
    return new Response(JSON.stringify({ ok: false, reason: "server_error" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
