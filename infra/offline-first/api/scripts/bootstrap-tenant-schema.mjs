import postgres from "postgres";
import { buildTenantDatabaseUrl, bootstrapTenantSchema, loadTenantBaselineMigration } from "../tenant-schema-bootstrap.mjs";
import { createDatabaseKey } from "../database-provisioning.mjs";

const [tenantSlug] = process.argv.slice(2);
if (!tenantSlug || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(tenantSlug)) {
  throw new Error("Usage: node infra/offline-first/api/scripts/bootstrap-tenant-schema.mjs <tenant-slug>");
}
if (!process.env.DATABASE_URL || !process.env.DATABASE_ADMIN_URL) {
  throw new Error("DATABASE_URL and DATABASE_ADMIN_URL are required");
}

const catalog = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 5 });
let target;
try {
  const tenants = await catalog`
    SELECT t.id, t.slug, r.database_key, r.status
    FROM tenants t
    JOIN tenant_database_registry r ON r.tenant_id = t.id
    WHERE t.slug = ${tenantSlug} AND t.status = 'active'
  `;
  if (tenants.length !== 1) throw new Error("active_tenant_database_mapping_not_found");
  const tenant = tenants[0];
  if (!["provisioning", "failed"].includes(tenant.status)) {
    throw new Error("tenant_database_not_in_bootstrap_state");
  }
  if (createDatabaseKey(tenant.id) !== tenant.database_key) {
    throw new Error("tenant_database_mapping_mismatch");
  }
  target = postgres(buildTenantDatabaseUrl(process.env.DATABASE_ADMIN_URL, tenant.database_key), {
    max: 1, connect_timeout: 5
  });
  const migrationSql = await loadTenantBaselineMigration();
  const result = await bootstrapTenantSchema({
    admin: target, tenant, databaseKey: tenant.database_key, migrationSql
  });
  console.log(JSON.stringify({ tenant_slug: tenant.slug, ...result }, null, 2));
} finally {
  await Promise.all([catalog.end(), target?.end()]);
}
