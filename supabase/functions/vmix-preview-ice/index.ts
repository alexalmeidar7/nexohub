import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Unauthorized" }, 401);
  const url = Deno.env.get("SUPABASE_URL")!;
  const key = Deno.env.get("SUPABASE_ANON_KEY")!;
  const client = createClient(url, key, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const { data: { user }, error } = await client.auth.getUser(token);
  if (error || !user) return json({ error: "Unauthorized" }, 401);
  let body;
  try { body = await req.json(); } catch { return json({ error: "Invalid request" }, 400); }
  if (typeof body?.connectionId !== "string" || !/^[a-f0-9-]{36}$/i.test(body.connectionId)) return json({ error: "Invalid studio" }, 400);
  // Same owner/team boundary as the private command room. This endpoint never writes data.
  const { data: connection } = await client.from("vmix_connections").select("id,user_id").eq("id", body.connectionId).maybeSingle();
  const { data: parent } = await client.rpc("current_parent_user_id");
  if (!connection || ![user.id, parent].includes(connection.user_id)) return json({ error: "Forbidden" }, 403);
  const iceServers: Array<{ urls: string[]; username?: string; credential?: string }> = [{ urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] }];
  // Use only the explicitly configured free Open Relay account. No paid account
  // creation, subscription, top-up or automatic plan changes are performed here.
  const domain = Deno.env.get("VMIX_METERED_DOMAIN") || "";
  const apiKey = Deno.env.get("VMIX_METERED_API_KEY");
  if (domain && apiKey) {
    if (!/^[a-z0-9-]+\.metered\.live$/i.test(domain)) return json({ error: "Invalid relay configuration" }, 503);
    try {
      const response = await fetch(`https://${domain}/api/v1/turn/credentials?apiKey=${encodeURIComponent(apiKey)}`, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) return json({ error: "Relay gratuito indisponível. Verifique a franquia e a conta do estúdio." }, 503);
      const servers = await response.json();
      if (!Array.isArray(servers)) return json({ error: "Invalid relay response" }, 503);
      for (const server of servers) {
        const urls = (Array.isArray(server.urls) ? server.urls : [server.urls]).filter((value: unknown) => typeof value === "string" && /^(stun|turn|turns):/.test(value));
        if (urls.length) iceServers.push({ urls, ...(typeof server.username === "string" ? { username: server.username } : {}), ...(typeof server.credential === "string" ? { credential: server.credential } : {}) });
      }
    } catch { return json({ error: "Não foi possível consultar o relay gratuito." }, 503); }
  }
  return json({ iceServers, relayConfigured: iceServers.some(server => server.urls.some(url => /^turns?:/.test(url))) });
});
