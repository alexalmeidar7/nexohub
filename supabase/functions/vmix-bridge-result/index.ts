import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

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
    if (!token) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers });
    let body: { jobId?: string; success?: boolean; statusCode?: number; body?: string };
    try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid result payload" }), { status: 400, headers }); }
    if (typeof body?.jobId !== "string" || typeof body?.success !== "boolean") {
      return new Response(JSON.stringify({ error: "jobId and success are required" }), { status: 400, headers });
    }
    const url = Deno.env.get("SUPABASE_URL");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !service) return new Response(JSON.stringify({ error: "Bridge backend is not configured" }), { status: 500, headers });
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: device, error: deviceError } = await admin.from("vmix_bridge_devices")
      .select("id").eq("token_hash", await hash(token)).eq("revoked", false).maybeSingle();
    if (deviceError) throw deviceError;
    if (!device) return new Response(JSON.stringify({ error: "Invalid or revoked Bridge token" }), { status: 401, headers });

    const statusCode = Number(body.statusCode);
    const { data: job, error } = await admin.from("vmix_bridge_jobs")
      .update({
        status: body.success ? "succeeded" : "failed",
        result_status: Number.isInteger(statusCode) && statusCode >= 0 && statusCode <= 599 ? statusCode : 0,
        result_body: typeof body.body === "string" ? body.body.slice(0, 500000) : "",
        completed_at: new Date().toISOString(),
      })
      .eq("id", body.jobId)
      .eq("device_id", device.id)
      .eq("status", "running")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!job) return new Response(JSON.stringify({ error: "Job not found or already finalized" }), { status: 404, headers });
    return new Response(JSON.stringify({ ok: true }), { headers });
  } catch (e) {
    console.error("vmix-bridge-result", e);
    return new Response(JSON.stringify({ error: "Could not store command result" }), { status: 500, headers });
  }
});
