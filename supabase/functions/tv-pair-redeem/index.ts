
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const headers = { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" };
const reply = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status, headers });
function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let differences = 0;
  for (let index = 0; index < a.length; index++) differences |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return differences === 0;
}
function isPairCode(code: string) {
  return /^\d{4}$/.test(code) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(code);
}
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ ok: false, reason: "method_not_allowed" }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const code = String(body?.code || "").trim();
    const tvSessionId = String(body?.tvSessionId || "").trim();
    const proof = String(body?.proof || "").trim().toLowerCase();
    if (!isPairCode(code) || !tvSessionId || tvSessionId.length > 128 || !/^[0-9a-f]{64}$/.test(proof))
      return reply({ ok: false, reason: "invalid_request" }, 400);
    const url = Deno.env.get("SUPABASE_URL");
    const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !secret) return reply({ ok: false, reason: "server_configuration" }, 503);
    const admin = createClient(url, secret, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: row, error: dbError } = await admin.from("tv_pairing_codes")
      .select("code,status,expires_at,tv_session_id,proof_hash,paired_user_id,paired_email")
      .eq("code", code).maybeSingle();
    if (dbError || !row || row.status !== "claimed" || row.tv_session_id !== tvSessionId ||
        !row.proof_hash || !row.paired_user_id) return reply({ ok: false, reason: "not_authorized" }, 403);
    if (Date.parse(row.expires_at) < Date.now()) return reply({ ok: false, reason: "expired" }, 403);
    const digestBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(proof));
    const digest = Array.from(new Uint8Array(digestBuffer), b => b.toString(16).padStart(2,"0")).join("");
    if (!constantTimeEqual(digest, String(row.proof_hash).toLowerCase()))
      return reply({ ok: false, reason: "invalid_device_proof" }, 403);
    const { data: found, error: userError } = await admin.auth.admin.getUserById(row.paired_user_id);
    if (userError || !found?.user?.email || found.user.id !== row.paired_user_id ||
        found.user.email.toLowerCase() !== String(row.paired_email || "").toLowerCase())
      return reply({ ok: false, reason: "user_not_verified" }, 403);
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink", email: found.user.email
    });
    if (linkError || !link?.properties?.hashed_token)
      return reply({ ok: false, reason: "token_generation_failed" }, 503);
    const { data: changed, error: updateError } = await admin.from("tv_pairing_codes")
      .update({ status: "redeemed" }).eq("code", code).eq("status", "claimed")
      .eq("tv_session_id", tvSessionId).select("code").maybeSingle();
    if (updateError || !changed) return reply({ ok: false, reason: "already_redeemed" }, 409);
    return reply({ ok: true, token_hash: link.properties.hashed_token });
  } catch (error) {
    console.error("[tv-pair-redeem] error", error);
    return reply({ ok: false, reason: "server_error" }, 500);
  }
});
