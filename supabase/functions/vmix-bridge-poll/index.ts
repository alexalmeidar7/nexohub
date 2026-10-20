import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
const headers = { ...corsHeaders, "Content-Type": "application/json" };
const hash = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: device, error } = await admin.from("vmix_bridge_devices").select("id,last_seen_at").eq("token_hash", await hash(token)).is("revoked_at", null).maybeSingle();
    if (error) throw error;
    if (!device) return new Response(JSON.stringify({ error: "Invalid Bridge token" }), { status: 401, headers });
    if (!device.last_seen_at || Date.now() - new Date(device.last_seen_at).getTime() > 15000) {
      await admin.from("vmix_bridge_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
    }
    const { data: jobs, error: jobError } = await admin.rpc("claim_next_vmix_bridge_job", { p_device_id: device.id });
    if (jobError) throw jobError;
    const job = jobs?.[0];
    return new Response(JSON.stringify({ job: job ? { id: job.id, path: job.path, method: job.method, body: job.body } : null }), { headers });
  } catch (e) {
    console.error("vmix-bridge-poll", e);
    return new Response(JSON.stringify({ error: "Bridge poll failed" }), { status: 500, headers });
  }
});
