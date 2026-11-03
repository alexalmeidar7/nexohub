import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!url || !service || !anon || !token) return json({ error: "Unauthorized" }, 401);

  const authClient = createClient(url, anon, { auth: { persistSession: false } });
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const cutoff = new Date(Date.now() - 45000).toISOString();
  const { data: device, error } = await admin
    .from("vmix_bridge_devices")
    .select("device_name,last_seen_at")
    .eq("user_id", user.id)
    .eq("revoked", false)
    .gte("last_seen_at", cutoff)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("vmix-bridge-status", error);
    return json({ error: "Não foi possível consultar o status da Ponte remota." }, 500);
  }

  if (!device) return json({ connected: false, deviceName: null });
  return json({ connected: true, deviceName: device.device_name || "Computador do estúdio", lastSeenAt: device.last_seen_at });
});
