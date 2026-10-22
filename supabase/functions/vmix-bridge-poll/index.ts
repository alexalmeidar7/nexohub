import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((b) => b.toString(16).padStart(2, "0")).join("");
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
  const url = Deno.env.get("SUPABASE_URL"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!token || !url || !service) return json({ error: "Unauthorized" }, 401);
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: device, error } = await admin.from("vmix_bridge_devices").select("id").eq("token_hash", await digest(token)).eq("revoked", false).maybeSingle();
  if (error || !device) return json({ error: "Token da Ponte inválido ou revogado." }, 401);
  await admin.from("vmix_bridge_devices").update({ last_seen_at: new Date().toISOString() }).eq("id", device.id);
  const { data: job, error: jobError } = await admin.from("vmix_bridge_jobs").select("id,path,method,body").eq("device_id", device.id).eq("status", "pending").order("created_at", { ascending: true }).limit(1).maybeSingle();
  if (jobError) { console.error("vmix-bridge-poll", jobError); return json({ error: "Falha ao consultar fila da Ponte." }, 500); }
  if (!job) return json({ job: null });
  const { data: claimed, error: claimError } = await admin.from("vmix_bridge_jobs").update({ status: "running", started_at: new Date().toISOString() }).eq("id", job.id).eq("status", "pending").select("id,path,method,body").maybeSingle();
  if (claimError) return json({ error: "Falha ao reservar comando." }, 500);
  if (!claimed) return json({ job: null });
  return json({ job: { id: claimed.id, path: claimed.path, method: claimed.method, body: claimed.body ?? null } });
});