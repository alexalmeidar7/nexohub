import { createDatabaseKey } from "./database-provisioning.mjs";
import { provisionTenantRuntimeCredentials } from "./tenant-runtime-credentials.mjs";

/**
 * Rotate the password for an already-active tenant's dedicated PostgreSQL
 * runtime role. The caller must securely persist the returned one-time secret.
 */
export async function rotateTenantRuntimeCredentials({
  admin,
  tenantDb,
  tenant,
  databaseKey,
  password,
  provision = provisionTenantRuntimeCredentials,
}) {
  if (!tenant || tenant.status !== "active") {
    throw new Error("tenant_must_be_active_for_credential_rotation");
  }
  if (createDatabaseKey(tenant.id) !== databaseKey || tenant.database_key !== databaseKey) {
    throw new Error("tenant_database_mapping_mismatch");
  }

  const result = await provision({ admin, tenantDb, tenant, databaseKey, password });
  return { ...result, status: "credentials_rotated" };
}
