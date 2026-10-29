import { createClient } from "npm:@supabase/supabase-js@2";

const jsonError = (message: string, status: number) =>
  new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

const isUuid = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

type AuthorizationResult =
  | { ok: true; targetUid: string; callerUid: string }
  | { ok: false; response: Response };

/**
 * Authorizes a station-scoped write before a service-role operation.
 * The requested tenant comes from a UUID or a known station slug; it is
 * never inferred from an arbitrary client-supplied fallback.
 */
export async function authorizeStationWrite(
  req: Request,
  body: Record<string, unknown>,
  slugToUid: Record<string, string>,
  adminClient: any,
): Promise<AuthorizationResult> {
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!token) return { ok: false, response: jsonError("Sessão não autenticada. Entre novamente no House Mix.", 401) };
  if (!supabaseUrl || !anonKey) return { ok: false, response: jsonError("Configuração de autenticação indisponível.", 500) };

  const authClient = createClient(supabaseUrl, anonKey, { auth: { persistSession: false } });
  const { data: authData, error: authError } = await authClient.auth.getUser(token);
  const caller = authData?.user;
  if (authError || !caller?.id) {
    return { ok: false, response: jsonError("Sessão inválida ou expirada. Entre novamente.", 401) };
  }

  const rawUser = String(body.user_id ?? body.userId ?? "").trim();
  const rawSlug = String(body.slug ?? "").trim().toLowerCase();
  const mappedUid = slugToUid[rawSlug] || slugToUid[rawUser.toLowerCase()] || "";
  const explicitUid = isUuid(rawUser) ? rawUser : "";

  if (rawUser && !explicitUid && !slugToUid[rawUser.toLowerCase()]) {
    return { ok: false, response: jsonError("Identificador da emissora inválido.", 400) };
  }
  if (rawSlug && !slugToUid[rawSlug] && !explicitUid) {
    return { ok: false, response: jsonError("Slug da emissora não reconhecido.", 400) };
  }

  if (explicitUid && mappedUid && explicitUid !== mappedUid) {
    return { ok: false, response: jsonError("A emissora informada não corresponde ao identificador enviado.", 403) };
  }

  const targetUid = explicitUid || mappedUid;

  const { data: subUser, error: subError } = await adminClient
    .from("sub_users")
    .select("parent_user_id, ativo")
    .eq("auth_user_id", caller.id)
    .limit(1)
    .maybeSingle();

  if (subError) {
    console.error("[station-write-auth] sub-user lookup failed:", subError);
    return { ok: false, response: jsonError("Não foi possível validar o vínculo da emissora.", 500) };
  }

  const parentUid = subUser?.ativo && isUuid(subUser.parent_user_id) ? subUser.parent_user_id : null;
  const resolvedTargetUid = targetUid || parentUid || caller.id;

  if (!isUuid(resolvedTargetUid)) {
    return { ok: false, response: jsonError("Identificador da emissora inválido ou ausente.", 400) };
  }

  const { data: adminRole, error: roleError } = await adminClient
    .from("user_roles")
    .select("role")
    .eq("user_id", caller.id)
    .eq("role", "admin")
    .limit(1)
    .maybeSingle();

  if (roleError) {
    console.error("[station-write-auth] role lookup failed:", roleError);
    return { ok: false, response: jsonError("Não foi possível validar as permissões da conta.", 500) };
  }

  const isAdmin = adminRole?.role === "admin";
  if (resolvedTargetUid !== caller.id && resolvedTargetUid !== parentUid && !isAdmin) {
    return { ok: false, response: jsonError("Você não tem permissão para alterar os dados desta emissora.", 403) };
  }

  return { ok: true, targetUid: resolvedTargetUid, callerUid: caller.id };
}

/**
 * Prevents a caller from reusing an existing row ID belonging to another
 * station when a service-role upsert is performed.
 */
export async function assertOwnedRecordIds(
  adminClient: any,
  table: string,
  ids: unknown[],
  targetUid: string,
): Promise<Response | null> {
  const uniqueIds = [...new Set(ids.filter(isUuid))];
  if (!uniqueIds.length) return null;

  const { data, error } = await adminClient
    .from(table)
    .select("id, user_id")
    .in("id", uniqueIds);

  if (error) {
    console.error("[station-write-auth] record ownership lookup failed:", { table, error });
    return jsonError("Não foi possível validar os registros antes da sincronização.", 500);
  }

  if ((data || []).some((row: any) => row.user_id !== targetUid)) {
    return jsonError("A operação contém um registro que pertence a outra emissora.", 409);
  }

  return null;
}
