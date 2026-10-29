import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { resolveTenantUserId } from "../_shared/auth.ts";

const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" };
const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
};
const randomCode = (bytes = 18) => {
  const data = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(data).map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: jsonHeaders });
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!auth.startsWith("Bearer ")) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });
    const userClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: jsonHeaders });

    const tenantUserId = await resolveTenantUserId(auth);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const code = randomCode();
    const { error: insertError } = await admin.from("vmix_bridge_pairings").insert({
      user_id: tenantUserId, code_hash: await sha256(code), expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    if (insertError) throw insertError;
    return new Response(JSON.stringify({ pairingCode: code, expiresInSeconds: 600 }), { headers: jsonHeaders });
  } catch (e) {
    console.error("vmix-bridge-pairing", e);
    return new Response(JSON.stringify({ error: "Could not create pairing code" }), { status: 500, headers: jsonHeaders });
  }
});
