import { supabase } from "@/integrations/supabase/client";

type JsonRecord = Record<string, unknown>;

const MAX_MERGE_RETRIES = 8;

function isPlainObject(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeDashboardItems(value: unknown): JsonRecord {
  if (Array.isArray(value)) {
    return { items: value };
  }

  if (isPlainObject(value)) {
    return { ...value };
  }

  return {};
}

function deepMerge(base: JsonRecord, patch: JsonRecord): JsonRecord {
  const merged: JsonRecord = { ...base };

  for (const [key, nextValue] of Object.entries(patch)) {
    if (nextValue === undefined) continue;

    const currentValue = merged[key];

    if (isPlainObject(currentValue) && isPlainObject(nextValue)) {
      merged[key] = deepMerge(currentValue, nextValue);
      continue;
    }

    merged[key] = nextValue;
  }

  return merged;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isNonRetryableAuthorizationError(error: unknown): boolean {
  return isPlainObject(error) && error.code === "42501";
}

const TENANT_USER_ID_CACHE_TTL_MS = 30_000;
const tenantUserIdCache = new Map<string, { tenantUserId: string; expiresAt: number }>();

/**
 * Resolve the tenant owner only when the requested ID is the current auth user.
 * This keeps explicit cross-tenant IDs unchanged and aligns sub-user writes with
 * the current_tenant_user_id() RLS policy.
 */
export async function resolveTenantUserId(userId: string): Promise<string> {
  if (!userId) return userId;

  const { data: { session }, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;

  const authUserId = session?.user.id;
  if (!authUserId || authUserId !== userId) return userId;

  const cached = tenantUserIdCache.get(authUserId);
  if (cached && cached.expiresAt > Date.now()) return cached.tenantUserId;

  const { data, error } = await (supabase as any).rpc("current_tenant_user_id");
  if (error) throw error;

  const tenantUserId = typeof data === "string" && data.trim() ? data : authUserId;
  tenantUserIdCache.set(authUserId, {
    tenantUserId,
    expiresAt: Date.now() + TENANT_USER_ID_CACHE_TTL_MS,
  });
  return tenantUserId;
}

/**
 * Faz merge seguro de dashboard_items com retry otimista para evitar perda de chaves
 * quando múltiplas telas atualizam o mesmo registro ao mesmo tempo.
 */
export async function mergeUserDashboardItems(userId: string, patch: JsonRecord): Promise<void> {
  if (!userId) return;

  const settingsUserId = await resolveTenantUserId(userId);
  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_MERGE_RETRIES; attempt += 1) {
    // Backoff with jitter to avoid collisions with concurrent writers (e.g. music sync)
    if (attempt > 0) {
      await sleep(100 * attempt + Math.random() * 150);
    }

    const { data: existing, error: readError } = await supabase
      .from("user_settings")
      .select("updated_at, dashboard_items")
      .eq("user_id", settingsUserId)
      .maybeSingle();

    if (readError) {
      throw readError;
    }

    const mergedDashboardItems = deepMerge(
      normalizeDashboardItems(existing?.dashboard_items),
      patch,
    );

    const nowIso = new Date().toISOString();

    if (!existing) {
      const { error: insertError } = await supabase
        .from("user_settings")
        .upsert(
          {
            user_id: settingsUserId,
            dashboard_items: mergedDashboardItems as any,
            updated_at: nowIso,
          },
          { onConflict: "user_id" },
        );

      if (!insertError) return;
      // RLS/permission failures are deterministic; retrying only multiplies 403 traffic.
      if (isNonRetryableAuthorizationError(insertError)) throw insertError;

      lastError = insertError;
      continue;
    }

    let updateQuery = supabase
      .from("user_settings")
      .update({
        dashboard_items: mergedDashboardItems as any,
        updated_at: nowIso,
      })
      .eq("user_id", settingsUserId);

    if (existing.updated_at) {
      updateQuery = updateQuery.eq("updated_at", existing.updated_at);
    } else {
      updateQuery = updateQuery.is("updated_at", null);
    }

    const { data: updatedRows, error: updateError } = await updateQuery
      .select("user_id")
      .limit(1);

    if (updateError) {
      // A tenant/RLS denial cannot be fixed by an optimistic-lock retry.
      if (isNonRetryableAuthorizationError(updateError)) throw updateError;
      lastError = updateError;
      continue;
    }

    if ((updatedRows?.length ?? 0) > 0) return;

    // Se falhou pelo optimistic lock e já tentamos várias vezes, fazer update direto por user_id para garantir persistência
    if (attempt >= 2) {
      const { data: directRows, error: directError } = await supabase
        .from("user_settings")
        .update({
          dashboard_items: mergedDashboardItems as any,
          updated_at: nowIso,
        })
        .eq("user_id", settingsUserId)
        .select("user_id")
        .limit(1);

      if (!directError && (directRows?.length ?? 0) > 0) return;
      if (directError) {
        if (isNonRetryableAuthorizationError(directError)) throw directError;
        lastError = directError;
      }
    }
  }

  throw lastError ?? new Error("Falha ao salvar dashboard_items com merge seguro.");
}