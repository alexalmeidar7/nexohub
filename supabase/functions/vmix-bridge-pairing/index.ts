import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const digest = async (value: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))).map((b) => b.toString(16).padStart(2, "0")).join("");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return json({ error: "Sessão não autenticada. Entre novamente no House Mix." }, 401);
  const url = Deno.env.get("SUPABASE_URL"), anon = Deno.env.get("SUPABASE_ANON_KEY"), service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anon || !service) return json({ error: "Configuração do backend incompleta para a Ponte remota." }, 500);
  const auth = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: { user }, error: authError } = await auth.auth.getUser();
  if (authError || !user) return json({ error: "Sessão inválida ou expirada. Entre novamente." }, 401);
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const pairingCode = crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const { error } = await admin.from("vmix_bridge_pairings").insert({ user_id: user.id, code_hash: await digest(pairingCode), expires_at: expiresAt });
  if (error) {
    console.error("vmix-bridge-pairing database error", error);
    return json({ error: "Não foi possível salvar o código de pareamento. Aplique a migração da Ponte remota e tente novamente." }, 500);
  }
  return json({ pairingCode, expiresAt });
});