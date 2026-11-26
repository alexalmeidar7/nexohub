import { createClient } from "npm:@supabase/supabase-js@2.95.3";
import { corsHeaders } from "npm:@supabase/supabase-js@2.95.3/cors";
import { hashDeviceProof, verifiedGoogleIdentity } from "../_shared/nexoTvIdentity.ts";
import { CADASTRO_FIELD_KEYS, DEFAULT_CADASTRO_RULES } from "../_shared/nexoListenerRules.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
const serverAuth = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const headers = { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" };
const json = (body: object, status = 200) => new Response(JSON.stringify(body), { status, headers });
const invalid = (reason: string) => json({ ok: false, reason });
const isUuid = (value: unknown): value is string => typeof value === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);

function isValidCpf(value: string) {
  if (!/^\d{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) return false;
  const digits = [...value].map(Number);
  return [9, 10].every((position) => {
    const sum = digits.slice(0, position).reduce((total, digit, index) => total + digit * (position + 1 - index), 0);
    return (sum * 10) % 11 % 10 === digits[position];
  });
}

function validateFields(input: unknown) {
  const fields: Record<string, string> = {};
  if (input == null) return fields;
  if (typeof input !== "object" || Array.isArray(input)) return null;
  for (const [key, raw] of Object.entries(input)) {
    if (!(CADASTRO_FIELD_KEYS as readonly string[]).includes(key) ||
      key === "email" || key === "nome" || typeof raw !== "string") return null;
    let value = raw.trim();
    if (!value || value.length > 160) return null;
    if (key === "cpf" || key === "telefone") {
      if (!/^[\d().+\-\s]+$/.test(value)) return null;
      value = value.replace(/\D/g, "");
      if (key === "cpf" ? !isValidCpf(value) : !/^\d{10,13}$/.test(value)) return null;
    }
    if (key === "uf") {
      value = value.toUpperCase();
      if (!/^(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)$/.test(value)) return null;
    }
    if (key === "data_nascimento") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01") return null;
      const date = new Date(value);
      if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== value || date > new Date()) return null;
    }
    fields[key] = value;
  }
  return fields;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers });
  if (request.method !== "POST") return json({ ok: false }, 405);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return invalid("invalid_request");
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: serverAuth });
  const auth = createClient(url, anonKey, { auth: serverAuth });

  try {
    if (body.action === "redeem") {
      if (typeof body.code !== "string" || !/^\d{4}$/.test(body.code) ||
        typeof body.proof !== "string" || !/^[a-f0-9]{64}$/.test(body.proof)) return invalid("invalid_request");
      const { data: device, error } = await admin.rpc("nexo_reserve_tv_session", {
        p_code: body.code, p_proof_hash: await hashDeviceProof(body.proof),
      }).maybeSingle<{ device_id: string; listener_id: string }>();
      if (error) throw error;
      if (!device) return invalid("invalid_or_consumed");
      const account = await admin.auth.admin.getUserById(device.listener_id);
      const identity = account.data.user && verifiedGoogleIdentity(account.data.user);
      if (!identity) return invalid("verified_google_required");
      const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "magiclink", email: identity.email });
      if (linkError || link.user.id !== device.listener_id) return invalid("session_unavailable");
      const { data: verified, error: verifyError } = await auth.auth.verifyOtp({
        type: "email", token_hash: link.properties.hashed_token,
      });
      if (verifyError || !verified.session) return invalid("session_unavailable");
      const { access_token, refresh_token } = verified.session;
      try {
        const { data: claims } = await auth.auth.getClaims(access_token);
        const sessionId = claims?.claims.session_id;
        if (verified.user?.id !== device.listener_id || !isUuid(sessionId)) throw new Error("session_mismatch");
        const { data: bound, error: bindError } = await admin.from("nexo_tv_devices")
          .update({ auth_session_id: sessionId }).eq("id", device.device_id).is("revoked_at", null)
          .is("auth_session_id", null).select("id").maybeSingle();
        if (bindError || !bound) throw new Error("session_binding_failed");
        return json({ ok: true, deviceId: device.device_id, access_token, refresh_token });
      } catch {
        await auth.auth.signOut({ scope: "local" });
        return invalid("session_unavailable");
      }
    }

    const jwt = /^Bearer (\S+)$/i.exec(request.headers.get("Authorization") ?? "")?.[1];
    if (!jwt || !isUuid(body.deviceId)) return invalid("invalid_request");
    const { data: { user } } = await auth.auth.getUser(jwt);
    if (!user) return invalid("not_authenticated");

    if (body.action === "revoke") {
      const { data: revoked, error } = await admin.rpc("nexo_revoke_tv_session", {
        p_device: body.deviceId, p_user: user.id,
      });
      if (error) throw error;
      return revoked ? json({ ok: true }) : invalid("device_not_found");
    }

    if (body.action === "status") {
      const { data: device, error } = await admin.from("nexo_tv_devices")
        .select("auth_session_id,revoked_at").eq("id", body.deviceId).eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      if (!device?.auth_session_id) return invalid("device_not_found");
      const { data } = await auth.auth.getClaims(jwt);
      if (data?.claims.session_id !== device.auth_session_id) return invalid("device_not_found");
      return json({ ok: true, active: !device.revoked_at });
    }

    if (body.action === "enroll") {
      const { data: claims } = await auth.auth.getClaims(jwt);
      if (!isUuid(claims?.claims.session_id)) return invalid("not_authenticated");
      const { data: tv, error: tvError } = await admin.from("nexo_tv_devices").select("id")
        .eq("auth_session_id", claims.claims.session_id).maybeSingle();
      if (tvError) throw tvError;
      if (tv) return invalid("mobile_session_required");
      const identity = verifiedGoogleIdentity(user);
      if (!identity) return invalid("verified_google_required");
      const fields = validateFields(body.fields);
      if (!fields) return invalid("invalid_fields");
      const { data, error } = await admin.rpc("nexo_enroll_player_listener", {
        p_device: body.deviceId, p_user: user.id, p_subject: identity.subject, p_email: identity.email,
        p_name: identity.name, p_avatar: identity.avatar, p_fields: fields, p_defaults: DEFAULT_CADASTRO_RULES,
      });
      if (error) throw error;
      return json(data);
    }
    return invalid("invalid_action");
  } catch {
    return invalid("server_error");
  }
});
