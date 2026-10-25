import crypto from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createDatabaseKey, validateDatabaseKey } from "./database-provisioning.mjs";
import { buildTenantOwnerRole } from "./postgres-tenant-provisioner.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const migrations = [
  { version: 1, name: "tenant_baseline", path: resolve(here, "../schema/tenant/001_tenant_baseline.sql") },
  { version: 2, name: "tenant_sync", path: resolve(here, "../schema/tenant/002_sync.sql") },
  { version: 3, name: "tenant_sync_checkpoints", path: resolve(here, "../schema/tenant/003_sync_checkpoints.sql") },
  { version: 4, name: "tenant_sync_inbox", path: resolve(here, "../schema/tenant/004_sync_inbox.sql") },
  { version: 5, name: "tenant_sync_inbox_leases", path: resolve(here, "../schema/tenant/005_sync_inbox_leases.sql") },
];
const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;

export function buildTenantDatabaseUrl(adminUrl, databaseKey) {
  validateDatabaseKey(databaseKey);
  const url = new URL(adminUrl);
  url.pathname = `/${databaseKey}`;
  return url.toString();
}

export async function loadTenantMigrations() {
  return Promise.all(migrations.map(async (migration) => ({
    version: migration.version,
    name: migration.name,
    sql: await readFile(migration.path, "utf8"),
  })));
}

export async function bootstrapTenantSchema({ admin, tenant, databaseKey, migrationSql, migrationList }) {
  validateDatabaseKey(databaseKey);
  const ownerRole = buildTenantOwnerRole(tenant.id);
  if (createDatabaseKey(tenant.id) !== databaseKey) throw new Error("tenant_database_mapping_mismatch");

  const databases = await admin`
    SELECT d.datname, pg_get_userbyid(d.datdba) AS owner
    FROM pg_database d WHERE d.datname = ${databaseKey}
  `;
  if (databases.length !== 1 || databases[0].owner !== ownerRole) {
    throw new Error("tenant_database_owner_verification_failed");
  }

  const pending = migrationList ?? (migrationSql
    ? [{ version: 1, name: "tenant_baseline", sql: migrationSql }]
    : await loadTenantMigrations());
  if (!Array.isArray(pending) || pending.length === 0) throw new Error("tenant_migrations_required");
  await admin.unsafe(`GRANT ${quoteIdentifier(ownerRole)} TO CURRENT_USER`);

  const appliedVersions = [];
  for (const migration of pending) {
    if (!Number.isInteger(migration.version) || migration.version < 1 ||
        typeof migration.name !== "string" || typeof migration.sql !== "string") {
      throw new Error("invalid_tenant_migration");
    }
    const checksum = crypto.createHash("sha256").update(migration.sql).digest("hex");
    const result = await admin.begin(async (tx) => {
      await tx.unsafe(`SET LOCAL ROLE ${quoteIdentifier(ownerRole)}`);
      await tx.unsafe(migration.sql);
      const applied = await tx`
        SELECT version, checksum_sha256
        FROM housemix.schema_migrations WHERE version = ${migration.version}
      `;
      if (applied.length) {
        if (applied[0].checksum_sha256 !== checksum) throw new Error("tenant_migration_checksum_mismatch");
        return "already_applied";
      }
      await tx`
        INSERT INTO housemix.schema_migrations (version, name, checksum_sha256)
        VALUES (${migration.version}, ${migration.name}, ${checksum})
      `;
      return "applied";
    });
    appliedVersions.push({ version: migration.version, status: result });
  }
  return { databaseKey, ownerRole, status: "schema_ready", migrations: appliedVersions };
}

export async function loadTenantBaselineMigration() {
  return readFile(migrations[0].path, "utf8");
}
