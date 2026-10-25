import postgres from "postgres";
import { provisionTenantDatabase } from "../postgres-tenant-provisioner.mjs";

const [tenantSlug] = process.argv.slice(2);
if (!tenantSlug || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(tenantSlug)) {
  throw new Error("Usage: node infra/offline-first/api/scripts/provision-tenant-database.mjs <tenant-slug>");
}
if (!process.env.DATABASE_URL || !process.env.DATABASE_ADMIN_URL) {
  throw new Error("DATABASE_URL and DATABASE_ADMIN_URL are required");
}

const catalog = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 5 });
const admin = postgres(process.env.DATABASE_ADMIN_URL, { max: 1, connect_timeout: 5 });
try {
  const tenants = await catalog`SELECT id, slug FROM tenants WHERE slug = ${tenantSlug} AND status = 'active'`;
  if (tenants.length !== 1) throw new Error("active_tenant_not_found");
  const result = await provisionTenantDatabase({
    catalog, admin, tenantId: tenants[0].id, tenantSlug: tenants[0].slug
  });
  console.log(JSON.stringify({
    tenant_slug: tenantSlug,
    database_key: result.databaseKey,
    owner_role: result.ownerRole,
    status: result.status,
    note: "Database created and owner verified. It remains unavailable to application traffic until a later migration/permission stage activates it."
  }, null, 2));
} finally {
  await Promise.all([catalog.end(), admin.end()]);
}
