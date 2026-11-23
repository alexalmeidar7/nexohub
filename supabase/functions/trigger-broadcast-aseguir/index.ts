import { createClient } from "npm:@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";
import { resolveManualAseguir } from "../_shared/broadcastAseguirSchedule.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Content-Type": "application/json; charset=utf-8",
};
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: cors });
const uuid = (id: unknown): id is string =>
  typeof id === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id);

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { headers: cors });
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const auth = await requireUser(request, cors);
  if (auth instanceof Response) return auth;
  const body = await request.json().catch(() => ({}));
  const owner = body?.owner_id;
  const mode = body?.mode;
  if (!uuid(owner) || (mode !== "next" && mode !== "later")) return json({ error: "invalid_request" }, 400);
  const url = Deno.env.get("SUPABASE_URL"), secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) return json({ error: "service_unavailable" }, 503);
  const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  if (auth.sub !== owner) {
    const { data: membership, error } = await admin.from("sub_users").select("id")
      .eq("parent_user_id", owner).eq("auth_user_id", auth.sub).eq("ativo", true).maybeSingle();
    if (error || !membership) return json({ error: "forbidden" }, 403);
  }
  const [{ data: settings, error: settingsError }, { data: station, error: stationError },
    { data: programs, error: programsError }] = await Promise.all([
    admin.from("user_settings").select("cenario_config").eq("user_id", owner).maybeSingle(),
    admin.from("empresa_config").select("timezone").eq("user_id", owner).maybeSingle(),
    admin.from("programas").select("id,nome,horario_inicio,dias_semana,variavel,data_variavel,estudio,ativo")
      .eq("user_id", owner).eq("ativo", true),
  ]);
  if (settingsError || stationError || programsError) return json({ error: "station_unavailable" }, 503);
  const broadcast = (settings?.cenario_config as Record<string, unknown> | null)?.broadcast as Record<string, unknown> | undefined;
  if (!broadcast?.aSeguirEnabled) return json({ error: "aseguir_disabled" }, 409);
  const now = new Date();
  const target = resolveManualAseguir(programs || [], now, station?.timezone || "America/Sao_Paulo", mode);
  if (!target) return json({ error: "no_upcoming_program" }, 422);
  const expires = new Date(now.getTime() + 45_000);
  const { error } = await admin.from("broadcast_aseguir_pulses").upsert(
    { user_id: owner, mode, triggered_at: now.toISOString(), expires_at: expires.toISOString() },
    { onConflict: "user_id" },
  );
  if (error) {
    console.error("Failed to persist A Seguir pulse", error.message);
    return json({ error: "pulse_unavailable" }, 503);
  }
  return json({ ok: true, ...target, expires_at: expires.toISOString() });
});
