import postgres from "postgres";
import { createDatabaseKey } from "../database-provisioning.mjs";
import { buildTenantDatabaseUrl, loadTenantBaselineMigration } from "../tenant-schema-bootstrap.mjs";
import { activateTenantDatabase } from "../tenant-database-activation.mjs";

const [tenantSlug] = process.argv.slice(2);
if (!tenantSlug || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(tenantSlug)) {
  throw new Error("Usage: node infra/offline-first/api/scripts/activate-tenant-database.mjs <tenant-slug>");
}
if (!process.env.DATABASE_URL || !process.env.DATABASE_ADMIN_URL) {
  throw new Error("DATABASE_URL and DATABASE_ADMIN_URL are required");
}

const catalog = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 5 });
const admin = postgres(process.env.DATABASE_ADMIN_URL, { max: 1, connect_timeout: 5 });
let tenantDb;
try {
  const tenants = await catalog`
    SELECT t.id, t.slug, t.status AS tenant_status,
           r.database_key, r.status AS database_status
    FROM tenants t JOIN tenant_database_registry r ON r.tenant_id = t.id
    WHERE t.slug = ${tenantSlug}
  `;
  if (tenants.length !== 1 || tenants[0].tenant_status !== "active") {
    throw new Error("active_tenant_database_mapping_not_found");
  }
  const row = tenants[0];
  if (row.database_status !== "provisioning" || createDatabaseKey(row.id) !== row.database_key) {
    throw new Error("tenant_database_not_in_activation_state");
  }
  const tenant = { id: row.id, slug: row.slug, status: row.tenant_status };
  tenantDb = postgres(buildTenantDatabaseUrl(process.env.DATABASE_ADMIN_URL, row.database_key), {
    max: 1, connect_timeout: 5
  });
  const migrationSql = await loadTenantBaselineMigration();
  const result = await activateTenantDatabase({
    catalog, admin, tenantDb, tenant, databaseKey: row.database_key, migrationSql
  });
  console.log(JSON.stringify({ tenant_slug: row.slug, ...result }, null, 2));
} finally {
  await Promise.all([catalog.end(), admin.end(), tenantDb?.end()]);
}
