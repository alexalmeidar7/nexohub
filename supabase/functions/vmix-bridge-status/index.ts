import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";

const jsonHeaders = {
  ...corsHeaders,
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: jsonHeaders });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = await requireUser(req, corsHeaders);
  if (auth instanceof Response) return auth;

  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return json({ error: "Bridge backend is not configured" }, 500);

  try {
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: devices, error } = await admin
      .from("vmix_bridge_devices")
      .select("device_name,last_seen_at")
      .eq("user_id", auth.sub)
      .eq("revoked", false)
      .gte("last_seen_at", new Date(Date.now() - 45_000).toISOString())
      .order("last_seen_at", { ascending: false })
      .limit(10);

    if (error) throw error;

    const now = Date.now();
    const online = (devices || [])
      .filter((device) => {
        if (!device.last_seen_at) return false;
        const lastSeen = Date.parse(device.last_seen_at);
        const age = now - lastSeen;
        return Number.isFinite(lastSeen) && age >= 0 && age <= 45_000;
      })
      .sort((a, b) => Date.parse(b.last_seen_at!) - Date.parse(a.last_seen_at!));

    if (!online.length) return json({ connected: false, deviceName: null, lastSeenAt: null });
    return json({
      connected: true,
      deviceName: online[0].device_name || "Computador do estúdio",
      lastSeenAt: online[0].last_seen_at,
    });
  } catch (error) {
    console.error("vmix-bridge-status", error);
    return json({ error: "Não foi possível consultar o status da Ponte remota." }, 500);
  }
});
