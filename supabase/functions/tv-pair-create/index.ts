import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const isUUID = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

async function resolveSlug(supabase: ReturnType<typeof createClient>, slug: string): Promise<string | null> {
  if (isUUID(slug)) return slug;
  const s = slug.toLowerCase().trim();
  // Igual Ã  ordem determinÃ­stica de public-player-data.
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
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const ua = req.headers.get("user-agent") || null;
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const logEvent = (row: Record<string, unknown>) =>
    supabase.from("tv_pairing_events").insert({ user_agent: ua, ip, ...row }).then(() => {}, () => {});
  try {
    const body = await req.json().catch(() => ({}));
    const userSlug = typeof body?.userSlug === "string" ? body.userSlug.trim() : "";
    const tvSessionId = typeof body?.tvSessionId === "string" ? body.tvSessionId.trim().slice(0, 128) : "";
    const proofHash = typeof body?.proofHash === "string" && /^[a-f0-9]{64}$/i.test(body.proofHash) ? body.proofHash.toLowerCase() : null;
    if (!userSlug || !tvSessionId) {
      await logEvent({ event_type: "error", reason: "missing_params", user_slug: userSlug || null, tv_session_id: tvSessionId || null });
      return new Response(JSON.stringify({ ok: false, reason: "missing_params" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const slugUserId = await resolveSlug(supabase, userSlug);
    if (!slugUserId) {
      await logEvent({ event_type: "error", reason: "slug_not_found", user_slug: userSlug, tv_session_id: tvSessionId });
      return new Response(JSON.stringify({ ok: false, reason: "slug_not_found" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Marca cÃ³digos expirados desta TV para evitar mÃºltiplos pendings no mesmo dispositivo.
    await supabase.from("tv_pairing_codes")
      .update({ status: "expired" })
      .eq("tv_session_id", tvSessionId)
      .eq("status", "pending");

    // Gera cÃ³digo 4 dÃ­gitos Ãºnico entre os pendings ativos.
    await supabase.from("tv_pairing_codes").update({ status: "expired" }).in("status", ["pending", "claimed"]).lte("expires_at", new Date().toISOString());

    let displayCode = "";
    let code = "";
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    for (let i = 0; i < 40; i++) {
      const random = new Uint32Array(1);
      crypto.getRandomValues(random);
      const candidate = String(1000 + (random[0] % 9000));
      const { data: existing } = await supabase.from("tv_pairing_codes").select("code").eq("display_code", candidate).in("status", ["pending", "claimed"]).limit(1).maybeSingle();
      if (existing) continue;
      const candidateToken = crypto.randomUUID();
      const { error: insertError } = await supabase.from("tv_pairing_codes").insert({ code: candidateToken, display_code: candidate, slug_user_id: slugUserId, user_slug: userSlug.toLowerCase(), tv_session_id: tvSessionId, proof_hash: proofHash, status: "pending", expires_at: expiresAt });
      if (!insertError) { displayCode = candidate; code = candidateToken; break; }
      if (insertError.code !== "23505") {
        console.error("[tv-pair-create] insert error:", insertError);
        await logEvent({ event_type: "error", reason: "insert_failed", slug_user_id: slugUserId, user_slug: userSlug, tv_session_id: tvSessionId, code: candidate, meta: { error: String(insertError.message || insertError) } });
        return new Response(JSON.stringify({ ok: false, reason: "insert_failed" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }
    if (!displayCode) {
      await logEvent({ event_type: "error", reason: "no_code_available", slug_user_id: slugUserId, user_slug: userSlug, tv_session_id: tvSessionId });
      return new Response(JSON.stringify({ ok: false, reason: "no_code_available" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    await logEvent({ event_type: "created", slug_user_id: slugUserId, user_slug: userSlug.toLowerCase(), tv_session_id: tvSessionId, code: displayCode, meta: { expires_at: expiresAt } });

    return new Response(JSON.stringify({ ok: true, code, displayCode, expiresAt, userSlug: userSlug.toLowerCase(), devicePairing: !!proofHash }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[tv-pair-create] error:", e);
    await logEvent({ event_type: "error", reason: "server_error", meta: { error: String((e as any)?.message || e) } });
    return new Response(JSON.stringify({ ok: false, reason: "server_error" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});

