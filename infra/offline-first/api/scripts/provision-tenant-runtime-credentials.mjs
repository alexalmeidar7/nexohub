import postgres from "postgres";
import { createDatabaseKey } from "../database-provisioning.mjs";
import { provisionTenantRuntimeCredentials } from "../tenant-runtime-credentials.mjs";

const [tenantSlug] = process.argv.slice(2);
if (!tenantSlug || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(tenantSlug)) {
  throw new Error("Usage: node infra/offline-first/api/scripts/provision-tenant-runtime-credentials.mjs <tenant-slug>");
}
if (!process.env.DATABASE_URL || !process.env.DATABASE_ADMIN_URL) {
  throw new Error("DATABASE_URL and DATABASE_ADMIN_URL are required");
}
const catalog = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 5 });
const admin = postgres(process.env.DATABASE_ADMIN_URL, { max: 1, connect_timeout: 5 });
try {
  const tenants = await catalog`
    SELECT t.id, t.slug, r.database_key, r.status
    FROM tenants t JOIN tenant_database_registry r ON r.tenant_id = t.id
    WHERE t.slug = ${tenantSlug} AND t.status = 'active'
  `;
  if (tenants.length !== 1) throw new Error("active_tenant_database_mapping_not_found");
  const tenant = tenants[0];
  if (tenant.status !== "provisioning" || createDatabaseKey(tenant.id) !== tenant.database_key) {
    throw new Error("tenant_database_not_ready_for_credentials");
  }
  const result = await provisionTenantRuntimeCredentials({
    admin, tenant, databaseKey: tenant.database_key
  });
  // This secret is displayed once. Do not redirect stdout or save it in logs.
  console.log(JSON.stringify({
    tenant_slug: tenant.slug,
    database_key: result.databaseKey,
    runtime_role: result.runtimeRole,
    status: result.status,
    password_once: result.password,
    warning: "Copy this secret directly into the approved local secret store. It cannot be recovered from PostgreSQL."
  }, null, 2));
} finally {
  await Promise.all([catalog.end(), admin.end()]);
}
