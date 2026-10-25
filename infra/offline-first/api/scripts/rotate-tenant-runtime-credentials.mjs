import postgres from "postgres";
import { createDatabaseKey } from "../database-provisioning.mjs";
import { buildTenantDatabaseUrl } from "../tenant-schema-bootstrap.mjs";
import { rotateTenantRuntimeCredentials } from "../tenant-runtime-credential-rotation.mjs";

const [tenantSlug] = process.argv.slice(2);
if (!tenantSlug || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(tenantSlug)) {
  throw new Error("Usage: node infra/offline-first/api/scripts/rotate-tenant-runtime-credentials.mjs <tenant-slug>");
}
if (!process.env.DATABASE_URL || !process.env.DATABASE_ADMIN_URL) {
  throw new Error("DATABASE_URL and DATABASE_ADMIN_URL are required");
}

const catalog = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 5 });
const admin = postgres(process.env.DATABASE_ADMIN_URL, { max: 1, connect_timeout: 5 });
let tenantDb;
try {
  const tenants = await catalog`
    SELECT t.id, t.slug, t.status, r.database_key
    FROM tenants t JOIN tenant_database_registry r ON r.tenant_id = t.id
    WHERE t.slug = ${tenantSlug} AND t.status = 'active'
  `;
  if (tenants.length !== 1) throw new Error("active_tenant_database_mapping_not_found");
  const tenant = tenants[0];
  if (tenant.status !== "active" || createDatabaseKey(tenant.id) !== tenant.database_key) {
    throw new Error("tenant_database_not_ready_for_rotation");
  }

  tenantDb = postgres(buildTenantDatabaseUrl(process.env.DATABASE_ADMIN_URL, tenant.database_key), { max: 1, connect_timeout: 5 });
  const result = await rotateTenantRuntimeCredentials({
    admin, tenantDb, tenant, databaseKey: tenant.database_key
  });

  // Display the new secret exactly once. Never redirect or log this output.
  console.log(JSON.stringify({
    tenant_slug: tenant.slug,
    database_key: result.databaseKey,
    runtime_role: result.runtimeRole,
    status: result.status,
    password_once: result.password,
    warning: "The previous password is invalid immediately. Store this new secret in the approved local DPAPI vault before reconnecting clients."
  }, null, 2));
} finally {
  await Promise.all([catalog.end(), admin.end(), tenantDb?.end()]);
}
