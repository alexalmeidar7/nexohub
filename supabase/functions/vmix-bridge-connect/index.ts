import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const headers = { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" };
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
    const token = randomToken();
    const { data: paired, error: pairingError } = await admin.rpc("connect_vmix_bridge_device", {
      p_code_hash: await hash(pairingCode),
      p_device_name: deviceName || "vMix Studio",
      p_token_hash: await hash(token),
    });
    if (pairingError) throw pairingError;
    if (paired !== true) {
      return new Response(JSON.stringify({ error: "Pairing code invalid, expired, or already used; generate a new code" }), { status: 409, headers });
    }
    return new Response(JSON.stringify({ token }), { headers });
  } catch (e) {
    console.error("vmix-bridge-connect", e);
    return new Response(JSON.stringify({ error: "Could not pair Bridge" }), { status: 500, headers });
  }
});
