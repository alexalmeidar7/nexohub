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
  let body: { jobId?: string; success?: boolean; statusCode?: number; body?: string };
  try { body = await req.json(); } catch { return json({ error: "Corpo inválido." }, 400); }
  if (!body.jobId) return json({ error: "jobId obrigatório." }, 400);
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: device } = await admin.from("vmix_bridge_devices").select("id").eq("token_hash", await digest(token)).eq("revoked", false).maybeSingle();
  if (!device) return json({ error: "Token da Ponte inválido ou revogado." }, 401);
  const { data: job, error } = await admin.from("vmix_bridge_jobs").update({ status: body.success ? "succeeded" : "failed", result_status: Number(body.statusCode) || 0, result_body: String(body.body || "").slice(0, 500000), completed_at: new Date().toISOString() }).eq("id", body.jobId).eq("device_id", device.id).eq("status", "running").select("id").maybeSingle();
  if (error) { console.error("vmix-bridge-result", error); return json({ error: "Falha ao salvar resultado do comando." }, 500); }
  if (!job) return json({ error: "Comando não encontrado ou já finalizado." }, 404);
  return json({ ok: true });
});