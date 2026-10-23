import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const headers = { ...corsHeaders, "Content-Type": "application/json" };
const hash = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers });
  try {
    const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    const url = Deno.env.get("SUPABASE_URL");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!token || !url || !service) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: device, error } = await admin.from("vmix_bridge_devices")
      .select("id")
      .eq("token_hash", await hash(token))
      .eq("revoked", false)
      .maybeSingle();
    if (error) throw error;
    if (!device) return new Response(JSON.stringify({ error: "Invalid or revoked Bridge token" }), { status: 401, headers });

    const { error: heartbeatError } = await admin.from("vmix_bridge_devices")
      .update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
    if (heartbeatError) throw heartbeatError;

    const { data: job, error: jobError } = await admin.from("vmix_bridge_jobs")
      .select("id,path,method,body")
      .eq("device_id", device.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (jobError) throw jobError;
    if (!job) return new Response(JSON.stringify({ job: null }), { headers });

    // Claim with a conditional update so concurrent poll requests cannot run the same job.
    const { data: claimed, error: claimError } = await admin.from("vmix_bridge_jobs")
      .update({ status: "running", started_at: new Date().toISOString() })
      .eq("id", job.id)
      .eq("device_id", device.id)
      .eq("status", "pending")
      .select("id,path,method,body")
      .maybeSingle();
    if (claimError) throw claimError;
    return new Response(JSON.stringify({ job: claimed ? { id: claimed.id, path: claimed.path, method: claimed.method, body: claimed.body ?? null } : null }), { headers });
  } catch (e) {
    console.error("vmix-bridge-poll", e);
    return new Response(JSON.stringify({ error: "Bridge poll failed" }), { status: 500, headers });
  }
});
