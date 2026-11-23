import { createClient } from "npm:@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";
import { sealWhatsAppToken, unsealWhatsAppToken } from "../_shared/whatsapp-credentials.ts";

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
const digits = (s: unknown): s is string => typeof s === "string" && /^\d{8,25}$/.test(s);
const uuid = (s: unknown): s is string =>
  typeof s === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(s);
const GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") || "v24.0";
const graph = (path: string) => "https://graph.facebook.com/" + GRAPH_VERSION + path;
const appId = () => Deno.env.get("META_APP_ID") || "";
const appSecret = () => Deno.env.get("META_APP_SECRET") || "";
const configId = () => Deno.env.get("META_EMBEDDED_SIGNUP_CONFIG_ID") || "";

async function metaRequest(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(graph(path), {
    ...init, redirect: "error", signal: AbortSignal.timeout(18000),
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, data, status: response.status };
}
async function registerNumber(numberId: string, token: string, pin: string) {
  return metaRequest("/" + numberId + "/register", token, {
    method: "POST", body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
}
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response(null, { headers });
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const identity = await requireUser(req, headers);
  if (identity instanceof Response) return identity;
  const owner = req.method === "GET"
    ? new URL(req.url).searchParams.get("owner_id")
    : (await req.clone().json().catch(() => ({})))?.owner_id;
  if (!uuid(owner)) return json({ error: "invalid_station" }, 400);
  const base = Deno.env.get("SUPABASE_URL"), serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !serviceKey) return json({ error: "unavailable" }, 503);
  const admin = createClient(base, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  if (identity.sub !== owner) {
    const { data: member } = await admin.from("sub_users").select("id")
      .eq("parent_user_id", owner).eq("auth_user_id", identity.sub).eq("ativo", true).maybeSingle();
    if (!member) return json({ error: "forbidden" }, 403);
  }
  const { data: cfg } = await admin.from("wa_config")
    .select("phone_number_id,display_phone,active").eq("user_id", owner).maybeSingle();
  const { data: credential } = await admin.from("wa_private_credentials")
    .select("waba_id,phone_number_id").eq("user_id", owner).maybeSingle();
  if (req.method === "GET") {
    const ready = !!appId() && !!appSecret() && !!configId() && !!Deno.env.get("WHATSAPP_VERIFY_TOKEN")
      && !!Deno.env.get("WHATSAPP_TOKEN_ENCRYPTION_KEY");
    return json({
      ready, app_id: ready ? appId() : "", config_id: ready ? configId() : "",
      graph_version: GRAPH_VERSION, connected: !!cfg?.active && !!credential &&
        cfg.phone_number_id === credential.phone_number_id,
      pending_activation: !!credential && !cfg?.active,
      display_phone: cfg?.display_phone || "",
    });
  }
  // Connecting/disconnecting a company-wide number is restricted to its owner account.
  if (identity.sub !== owner) return json({ error: "owner_permission_required" }, 403);
  const body = await req.json().catch(() => ({}));
  const action = body.action;
  if (action === "disconnect") {
    // Remove secret before showing disconnected: stale webhooks cannot send replies.
    await admin.from("wa_private_credentials").delete().eq("user_id", owner);
    await admin.from("wa_config").update({ active: false }).eq("user_id", owner);
    return json({ ok: true, connected: false });
  }
  if (!appId() || !appSecret() || !configId() || !Deno.env.get("WHATSAPP_TOKEN_ENCRYPTION_KEY")) {
    return json({ error: "meta_setup_pending" }, 503);
  }
  if (action === "activate") {
    const { data: saved } = await admin.from("wa_private_credentials").select("*").eq("user_id", owner).maybeSingle();
    if (!saved) return json({ error: "not_connected" }, 404);
    const { access_token, pin } = await unsealWhatsAppToken(saved.token_ciphertext);
    if (!pin) return json({ error: "registration_pending" }, 409);
    const result = await registerNumber(saved.phone_number_id, access_token, pin);
    if (!result.ok) return json({ error: "registration_pending" }, 409);
    await admin.from("wa_config").update({ active: true }).eq("user_id", owner);
    return json({ ok: true, connected: true });
  }
  if (action !== "finish") return json({ error: "invalid_action" }, 400);
  const code = body.code, waba = body.waba_id, phoneId = body.phone_number_id;
  const coexistence = body.coexistence === true;
  if (typeof code !== "string" || code.length < 12 || code.length > 2048 ||
    !digits(waba) || !digits(phoneId)) return json({ error: "invalid_meta_response" }, 400);
  // Exchange the short-lived code directly on the server. App Secret never goes to the browser.
  const query = new URLSearchParams({ client_id: appId(), client_secret: appSecret(), code });
  const exchange = await fetch(graph("/oauth/access_token?" + query.toString()), {
    redirect: "error", signal: AbortSignal.timeout(12000),
  });
  const tokenResponse = await exchange.json().catch(() => ({}));
  const token = tokenResponse.access_token;
  if (!exchange.ok || typeof token !== "string") return json({ error: "meta_authorization_failed" }, 400);
  // Verify the phone belongs to the WABA granted to this token; never trust postMessage IDs.
  const phones = await metaRequest("/" + waba + "/phone_numbers?fields=id,display_phone_number&limit=100", token);
  const ownedPhone = (phones.data?.data || []).find((p: any) => p.id === phoneId);
  if (!phones.ok || !ownedPhone) return json({ error: "meta_phone_validation_failed" }, 403);
  const { data: taken } = await admin.from("wa_private_credentials").select("user_id")
    .eq("phone_number_id", phoneId).maybeSingle();
  if (taken?.user_id && taken.user_id !== owner) return json({ error: "phone_already_connected" }, 409);
  const subscribed = await metaRequest("/" + waba + "/subscribed_apps", token, { method: "POST", body: "{}" });
  if (!subscribed.ok || subscribed.data?.success !== true) return json({ error: "meta_subscription_failed" }, 502);
  const pin = String(crypto.getRandomValues(new Uint32Array(1))[0] % 900000 + 100000);
  // Coexistence numbers are already registered in the WhatsApp Business app;
  // new Cloud API numbers require an explicit /register call.
  const registration = coexistence ? { ok: true } : await registerNumber(phoneId, token, pin);
  const encrypted = await sealWhatsAppToken(token, coexistence ? undefined : pin);
  const { error: stored } = await admin.from("wa_private_credentials").upsert({
    user_id: owner, phone_number_id: phoneId, waba_id: waba, token_ciphertext: encrypted,
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  if (stored) return json({ error: "credential_storage_failed" }, 503);
  const { error: saved } = await admin.from("wa_config").upsert({
    user_id: owner, phone_number_id: phoneId, display_phone: ownedPhone.display_phone_number || null,
    active: !!registration.ok,
  }, { onConflict: "user_id" });
  if (saved) return json({ error: "connection_storage_failed" }, 503);
  return json({
    ok: true, connected: !!registration.ok, pending_activation: !registration.ok,
    display_phone: ownedPhone.display_phone_number || "",
  });
});
