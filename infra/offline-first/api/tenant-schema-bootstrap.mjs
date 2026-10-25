import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { validateDatabaseKey } from "./database-provisioning.mjs";
import { buildTenantOwnerRole } from "./postgres-tenant-provisioner.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const migrationPath = resolve(here, "../schema/tenant/001_tenant_baseline.sql");
const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;

export function buildTenantDatabaseUrl(adminUrl, databaseKey) {
  validateDatabaseKey(databaseKey);
  const url = new URL(adminUrl);
  url.pathname = `/${databaseKey}`;
  return url.toString();
}

export async function bootstrapTenantSchema({ admin, tenant, databaseKey, migrationSql }) {
  validateDatabaseKey(databaseKey);
  const ownerRole = buildTenantOwnerRole(tenant.id);
  const expected = `hm_${databaseKey.slice(3)}`;
  if (databaseKey !== expected) throw new Error("tenant_database_mapping_mismatch");
  const checksum = crypto.createHash("sha256").update(migrationSql).digest("hex");

  const databases = await admin`
    SELECT d.datname, pg_get_userbyid(d.datdba) AS owner
    FROM pg_database d WHERE d.datname = ${databaseKey}
  `;
  if (databases.length !== 1 || databases[0].owner !== ownerRole) {
    throw new Error("tenant_database_owner_verification_failed");
  }

  await admin.unsafe(`GRANT ${quoteIdentifier(ownerRole)} TO CURRENT_USER`);
  const result = await admin.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE ${quoteIdentifier(ownerRole)}`);
    await tx.unsafe(migrationSql);
    const applied = await tx`
      SELECT version, checksum_sha256
      FROM housemix.schema_migrations WHERE version = 1
    `;
    if (applied.length) {
      if (applied[0].checksum_sha256 !== checksum) throw new Error("tenant_migration_checksum_mismatch");
      return { alreadyApplied: true, version: 1 };
    }
    await tx`
      INSERT INTO housemix.schema_migrations (version, name, checksum_sha256)
      VALUES (1, 'tenant_baseline', ${checksum})
    `;
    return { alreadyApplied: false, version: 1 };
  });
  return { databaseKey, ownerRole, status: "schema_ready", ...result };
}

export async function loadTenantBaselineMigration() {
  return readFile(migrationPath, "utf8");
}
