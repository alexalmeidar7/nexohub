import { supabase } from "@/integrations/supabase/client";

type JsonRecord = Record<string, unknown>;

const MAX_MERGE_RETRIES = 5;

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

/**
 * Faz merge seguro de dashboard_items com retry otimista para evitar perda de chaves
 * quando múltiplas telas atualizam o mesmo registro ao mesmo tempo.
 */
export async function mergeUserDashboardItems(userId: string, patch: JsonRecord): Promise<void> {
  if (!userId) return;

  let lastError: unknown = null;

  for (let attempt = 0; attempt < MAX_MERGE_RETRIES; attempt += 1) {
    const { data: existing, error: readError } = await supabase
      .from("user_settings")
      .select("updated_at, dashboard_items")
      .eq("user_id", userId)
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
            user_id: userId,
            dashboard_items: mergedDashboardItems as any,
            updated_at: nowIso,
          },
          { onConflict: "user_id" },
        );

      if (!insertError) return;

      lastError = insertError;
      continue;
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from("user_settings")
      .update({
        dashboard_items: mergedDashboardItems as any,
        updated_at: nowIso,
      })
      .eq("user_id", userId)
      .eq("updated_at", existing.updated_at)
      .select("user_id")
      .limit(1);

    if (updateError) {
      lastError = updateError;
      continue;
    }

    if ((updatedRows?.length ?? 0) > 0) return;
  }

  throw lastError ?? new Error("Falha ao salvar dashboard_items com merge seguro.");
}