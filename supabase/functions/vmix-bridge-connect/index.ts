import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((b) => b.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const url = Deno.env.get("SUPABASE_URL"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return json({ error: "Configuração do backend incompleta." }, 500);
  let body: { pairingCode?: string; deviceName?: string };
  try { body = await req.json(); } catch { return json({ error: "Corpo da requisição inválido." }, 400); }
  const code = String(body.pairingCode || "").trim().toUpperCase();
  const deviceName = String(body.deviceName || "Estúdio").trim().slice(0, 120);
  if (!/^[A-F0-9]{8}$/.test(code)) return json({ error: "Código de pareamento inválido." }, 400);
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: pairing, error } = await admin.from("vmix_bridge_pairings").select("id,user_id,expires_at,used_at").eq("code_hash", await digest(code)).is("used_at", null).gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) { console.error("vmix-bridge-connect lookup", error); return json({ error: "Não foi possível validar o código. Aplique a migração da Ponte remota." }, 500); }
  if (!pairing) return json({ error: "Código expirado ou inválido. Gere um novo código no House Mix." }, 400);
  const token = crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
  const { data: consumed, error: consumeError } = await admin.from("vmix_bridge_pairings").update({ used_at: new Date().toISOString() }).eq("id", pairing.id).is("used_at", null).select("id").maybeSingle();
  if (consumeError || !consumed) return json({ error: "Este código já foi utilizado. Gere um novo código." }, 409);
  const { error: insertError } = await admin.from("vmix_bridge_devices").insert({ user_id: pairing.user_id, device_name: deviceName || "Estúdio", token_hash: await digest(token), last_seen_at: new Date().toISOString() });
  if (insertError) { console.error("vmix-bridge-connect insert", insertError); return json({ error: "Não foi possível registrar este computador." }, 500); }
  return json({ token });
});