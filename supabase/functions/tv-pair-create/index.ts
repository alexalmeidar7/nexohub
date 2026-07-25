import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

async function resolveSlug(supabase: ReturnType<typeof createClient>, slug: string): Promise<string | null> {
  if (isUUID(slug)) return slug;
  const s = slug.toLowerCase().trim();
  // Igual à ordem determinística de public-player-data.
  let { data } = await supabase.from("profiles").select("user_id").ilike("email", `${s}@%`).order("email").limit(1).maybeSingle();
  if (data?.user_id) return data.user_id;
  const { data: sub } = await supabase.from("sub_users").select("auth_user_id, parent_user_id, ativo").ilike("email", `${s}@%`).order("email").limit(1).maybeSingle();
  if (sub?.auth_user_id) return (sub.ativo && sub.parent_user_id) ? sub.parent_user_id : sub.auth_user_id;
  const { data: d3 } = await supabase.from("profiles").select("user_id").ilike("email", `${s}%@%`).order("email").limit(1).maybeSingle();
  if (d3?.user_id) return d3.user_id;
  const { data: sub2 } = await supabase.from("sub_users").select("auth_user_id, parent_user_id, ativo").ilike("email", `${s}%@%`).order("email").limit(1).maybeSingle();
  if (sub2?.auth_user_id) return (sub2.ativo && sub2.parent_user_id) ? sub2.parent_user_id : sub2.auth_user_id;
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const userSlug = typeof body?.userSlug === "string" ? body.userSlug.trim() : "";
    const tvSessionId = typeof body?.tvSessionId === "string" ? body.tvSessionId.trim().slice(0, 128) : "";
    if (!userSlug || !tvSessionId) {
      return new Response(JSON.stringify({ ok: false, reason: "missing_params" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const slugUserId = await resolveSlug(supabase, userSlug);
    if (!slugUserId) {
      return new Response(JSON.stringify({ ok: false, reason: "slug_not_found" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Marca códigos expirados desta TV para evitar múltiplos pendings no mesmo dispositivo.
    await supabase.from("tv_pairing_codes")
      .update({ status: "expired" })
      .eq("tv_session_id", tvSessionId)
      .eq("status", "pending");

    // Gera código 4 dígitos único entre os pendings ativos.
    let code = "";
    for (let i = 0; i < 25; i++) {
      const candidate = String(Math.floor(1000 + Math.random() * 9000));
      const { data: existing } = await supabase
        .from("tv_pairing_codes")
        .select("code")
        .eq("code", candidate)
        .in("status", ["pending", "claimed"])
        .maybeSingle();
      if (!existing) { code = candidate; break; }
    }
    if (!code) {
      return new Response(JSON.stringify({ ok: false, reason: "no_code_available" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { error } = await supabase.from("tv_pairing_codes").insert({
      code,
      slug_user_id: slugUserId,
      user_slug: userSlug.toLowerCase(),
      tv_session_id: tvSessionId,
      status: "pending",
      expires_at: expiresAt,
    });
    if (error) {
      console.error("[tv-pair-create] insert error:", error);
      return new Response(JSON.stringify({ ok: false, reason: "insert_failed" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ ok: true, code, expiresAt, userSlug: userSlug.toLowerCase() }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[tv-pair-create] error:", e);
    return new Response(JSON.stringify({ ok: false, reason: "server_error" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
