import { createDatabaseKey } from "./database-provisioning.mjs";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createTenantRegistryLookup(controlPlaneDb) {
  if (!controlPlaneDb || typeof controlPlaneDb.unsafe !== "function") {
    throw new TypeError("A control-plane PostgreSQL client is required");
  }

  return async function findTenantDatabaseRegistryEntry(authenticatedTenantId) {
    if (typeof authenticatedTenantId !== "string" || !UUID_PATTERN.test(authenticatedTenantId)) {
      throw new TypeError("An authenticated tenant UUID is required");
    }

    const rows = await controlPlaneDb.unsafe(
      `SELECT tenant_id, database_key, status, schema_version
       FROM tenant_database_registry
       WHERE tenant_id = $1
       LIMIT 1`,
      [authenticatedTenantId],
    );

    if (!Array.isArray(rows) || rows.length !== 1) return null;
    const entry = rows[0];
    if (entry.tenant_id !== authenticatedTenantId ||
        entry.database_key !== createDatabaseKey(authenticatedTenantId)) {
      throw new Error("tenant_database_registry_mapping_mismatch");
    }

    return Object.freeze({
      tenant_id: entry.tenant_id,
      database_key: entry.database_key,
      status: entry.status,
      schema_version: Number(entry.schema_version),
    });
  };
}
