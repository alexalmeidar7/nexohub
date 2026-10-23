import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const headers = { ...corsHeaders, "Content-Type": "application/json" };
const hash = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
};
const randomToken = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  try {
    let input: { pairingCode?: string; deviceName?: string };
    try { input = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid request body" }), { status: 400, headers }); }
    const pairingCode = typeof input?.pairingCode === "string" ? input.pairingCode.trim().toUpperCase() : "";
    const deviceName = typeof input?.deviceName === "string" ? input.deviceName.trim().slice(0, 120) : "vMix Studio";
    if (!/^[A-F0-9]{36}$/.test(pairingCode)) return new Response(JSON.stringify({ error: "Invalid pairing code" }), { status: 400, headers });

    const url = Deno.env.get("SUPABASE_URL");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !service) return new Response(JSON.stringify({ error: "Bridge backend is not configured" }), { status: 500, headers });
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const now = new Date().toISOString();
    const { data: pairing, error } = await admin.from("vmix_bridge_pairings")
      .select("id,user_id,expires_at,used_at")
      .eq("code_hash", await hash(pairingCode))
      .is("used_at", null)
      .gt("expires_at", now)
      .maybeSingle();
    if (error) throw error;
    if (!pairing) return new Response(JSON.stringify({ error: "Pairing code invalid, expired, or already used" }), { status: 401, headers });

    // Conditional consumption prevents two concurrent requests from using the same code.
    const { data: consumed, error: consumeError } = await admin.from("vmix_bridge_pairings")
      .update({ used_at: now })
      .eq("id", pairing.id)
      .is("used_at", null)
      .select("id")
      .maybeSingle();
    if (consumeError) throw consumeError;
    if (!consumed) return new Response(JSON.stringify({ error: "Pairing code already used; generate a new code" }), { status: 409, headers });

    const token = randomToken();
    const { error: deviceError } = await admin.from("vmix_bridge_devices").insert({
      user_id: pairing.user_id,
      device_name: deviceName || "vMix Studio",
      token_hash: await hash(token),
      revoked: false,
      last_seen_at: now,
    });
    if (deviceError) throw deviceError;
    return new Response(JSON.stringify({ token }), { headers });
  } catch (e) {
    console.error("vmix-bridge-connect", e);
    return new Response(JSON.stringify({ error: "Could not pair Bridge" }), { status: 500, headers });
  }
});
