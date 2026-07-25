import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") || "";
    const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
    if (!jwt) {
      return new Response(JSON.stringify({ ok: false, reason: "not_authenticated" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Cliente com JWT do usuário para validar auth.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ ok: false, reason: "invalid_session" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!/^\d{4}$/.test(code)) {
      return new Response(JSON.stringify({ ok: false, reason: "invalid_code" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: row } = await admin
      .from("tv_pairing_codes")
      .select("code, status, expires_at, user_slug")
      .eq("code", code)
      .maybeSingle();

    if (!row) {
      return new Response(JSON.stringify({ ok: false, reason: "code_not_found" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (row.status !== "pending") {
      return new Response(JSON.stringify({ ok: false, reason: "code_already_used" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      await admin.from("tv_pairing_codes").update({ status: "expired" }).eq("code", code);
      return new Response(JSON.stringify({ ok: false, reason: "code_expired" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const meta = (user.user_metadata || {}) as Record<string, any>;
    const paired_name = String(meta.full_name || meta.name || meta.given_name || user.email?.split("@")[0] || "").trim() || null;
    const paired_avatar = String(meta.avatar_url || meta.picture || "").trim() || null;

    const { error: updErr } = await admin
      .from("tv_pairing_codes")
      .update({
        status: "claimed",
        paired_user_id: user.id,
        paired_email: user.email,
        paired_name,
        paired_avatar,
        claimed_at: new Date().toISOString(),
      })
      .eq("code", code);

    if (updErr) {
      console.error("[tv-pair-claim] update error:", updErr);
      return new Response(JSON.stringify({ ok: false, reason: "update_failed" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, userSlug: row.user_slug }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[tv-pair-claim] error:", e);
    return new Response(JSON.stringify({ ok: false, reason: "server_error" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
