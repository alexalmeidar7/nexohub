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
    const input = await req.json();
    const pairingCode = typeof input?.pairingCode === "string" ? input.pairingCode.trim().toUpperCase() : "";
    const deviceName = typeof input?.deviceName === "string" ? input.deviceName.trim().slice(0, 100) : "vMix Studio";
    if (!pairingCode || pairingCode.length < 16) return new Response(JSON.stringify({ error: "Invalid pairing code" }), { status: 400, headers });

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const codeHash = await hash(pairingCode);
    const { data: pairing, error } = await admin.from("vmix_bridge_pairings").select("id,user_id,expires_at").eq("code_hash", codeHash).maybeSingle();
    if (error) throw error;
    if (!pairing || new Date(pairing.expires_at).getTime() < Date.now()) return new Response(JSON.stringify({ error: "Pairing code invalid or expired" }), { status: 401, headers });

    const token = randomToken();
    const { error: deviceError } = await admin.from("vmix_bridge_devices").insert({
      user_id: pairing.user_id, name: deviceName || "vMix Studio", token_hash: await hash(token), last_seen_at: new Date().toISOString(),
    });
    if (deviceError) throw deviceError;
    await admin.from("vmix_bridge_pairings").delete().eq("id", pairing.id);
    return new Response(JSON.stringify({ token }), { headers });
  } catch (e) {
    console.error("vmix-bridge-connect", e);
    return new Response(JSON.stringify({ error: "Could not pair Bridge" }), { status: 500, headers });
  }
});
