import { createTenantDatabaseClient } from "./tenant-runtime-router.mjs";
import { createTenantRegistryLookup } from "./tenant-registry-adapter.mjs";

/**
 * Compose the authenticated tenant registry, protected secret vault and
 * PostgreSQL factory into one request-scoped runtime client provider.
 * The caller must pass tenant identity from authenticated server context only.
 */
export function createTenantRuntimeService({
  controlPlaneDb,
  secretVault,
  controlPlaneUrl,
  postgresFactory,
  allowedHost = "127.0.0.1",
}) {
  if (!secretVault || typeof secretVault.getTenantRuntimeSecret !== "function") {
    throw new TypeError("A protected tenant runtime secret vault is required");
  }
  if (typeof postgresFactory !== "function") {
    throw new TypeError("A PostgreSQL client factory is required");
  }

  const findRegistryEntry = createTenantRegistryLookup(controlPlaneDb);

  return Object.freeze({
    async openForAuthenticatedTenant(authenticatedTenantId) {
      return createTenantDatabaseClient({
        authenticatedTenantId,
        findRegistryEntry,
        getRuntimeSecret: (tenantId) => secretVault.getTenantRuntimeSecret(tenantId),
        controlPlaneUrl,
        postgresFactory,
        allowedHost,
      });
    },
  });
}
