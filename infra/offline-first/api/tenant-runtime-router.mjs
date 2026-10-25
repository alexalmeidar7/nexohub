import { createDatabaseKey } from "./database-provisioning.mjs";
import { buildTenantRuntimeRole } from "./tenant-runtime-credentials.mjs";

function assertTenantId(value) {
  if (typeof value !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new TypeError("An authenticated tenant UUID is required");
  }
}

export function buildTenantRuntimeConnectionConfig({
  tenantId, registryEntry, runtimeSecret, controlPlaneUrl, allowedHost = "127.0.0.1",
}) {
  assertTenantId(tenantId);
  const databaseKey = createDatabaseKey(tenantId);
  const runtimeRole = buildTenantRuntimeRole(tenantId);

  if (!registryEntry || registryEntry.tenant_id !== tenantId ||
      registryEntry.database_key !== databaseKey || registryEntry.status !== "active") {
    throw new Error("tenant_database_not_active_or_mapping_mismatch");
  }
  if (!runtimeSecret || typeof runtimeSecret.password !== "string" ||
      runtimeSecret.password.length < 48 ||
      !/^[A-Za-z0-9_-]+$/.test(runtimeSecret.password) ||
      runtimeSecret.role !== runtimeRole) {
    throw new Error("tenant_runtime_secret_invalid");
  }

  const url = new URL(controlPlaneUrl);
  if (!["postgres:", "postgresql:"].includes(url.protocol) ||
      url.hostname !== allowedHost || url.username || url.password) {
    throw new Error("tenant_database_connection_origin_not_allowed");
  }
  url.username = runtimeRole;
  url.password = runtimeSecret.password;
  url.pathname = `/${databaseKey}`;
  url.search = "";
  url.hash = "";

  return Object.freeze({
    tenantId,
    databaseKey,
    runtimeRole,
    connectionString: url.toString(),
    max: 10,
    idle_timeout: 20,
    connect_timeout: 5,
    prepare: false,
  });
}

/**
 * Tenant identity must come from the already-authenticated request context.
 * The registry lookup and secret vault are injected so this module never
 * trusts a tenant slug, database name, or connection URL supplied by a client.
 */
export async function createTenantDatabaseClient({
  authenticatedTenantId, findRegistryEntry, getRuntimeSecret,
  controlPlaneUrl, postgresFactory, allowedHost = "127.0.0.1",
}) {
  assertTenantId(authenticatedTenantId);
  if (typeof findRegistryEntry !== "function" ||
      typeof getRuntimeSecret !== "function" ||
      typeof postgresFactory !== "function") {
    throw new TypeError("Tenant registry, secret vault and PostgreSQL factory are required");
  }

  const registryEntry = await findRegistryEntry(authenticatedTenantId);
  const runtimeSecret = await getRuntimeSecret(authenticatedTenantId);
  const config = buildTenantRuntimeConnectionConfig({
    tenantId: authenticatedTenantId, registryEntry, runtimeSecret,
    controlPlaneUrl, allowedHost,
  });
  const client = postgresFactory(config.connectionString, {
    max: config.max,
    idle_timeout: config.idle_timeout,
    connect_timeout: config.connect_timeout,
    prepare: config.prepare,
  });
  return Object.freeze({ tenantId: config.tenantId, databaseKey: config.databaseKey, client });
}
