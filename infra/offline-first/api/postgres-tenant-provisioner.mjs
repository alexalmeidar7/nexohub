import { createDatabaseKey, validateDatabaseKey } from "./database-provisioning.mjs";

const quoteIdentifier = (value) => `"${String(value).replaceAll('"', '""')}"`;

export function buildTenantOwnerRole(tenantId) {
  const databaseKey = createDatabaseKey(tenantId);
  return `hm_owner_${databaseKey.slice(3)}`;
}

export function buildTenantDatabaseConnectIsolationStatements(databaseKey) {
  const safeDatabase = validateDatabaseKey(databaseKey);
  return [
    `REVOKE CONNECT ON DATABASE ${quoteIdentifier(safeDatabase)} FROM PUBLIC`,
    `GRANT CONNECT ON DATABASE ${quoteIdentifier(safeDatabase)} TO CURRENT_USER`,
  ];
}

export function buildCreateDatabaseStatement(databaseKey, ownerRole) {
  const safeDatabase = validateDatabaseKey(databaseKey);
  if (typeof ownerRole !== "string" || !/^hm_owner_[a-f0-9]{32}$/.test(ownerRole)) {
    throw new TypeError("Invalid server-generated owner role");
  }
  return `CREATE DATABASE ${quoteIdentifier(safeDatabase)} OWNER ${quoteIdentifier(ownerRole)} TEMPLATE template0 ENCODING 'UTF8'`;
}

export async function provisionTenantDatabase({ catalog, admin, tenantId, tenantSlug }) {
  const databaseKey = createDatabaseKey(tenantId);
  const ownerRole = buildTenantOwnerRole(tenantId);
  let reservation;

  try {
    reservation = await catalog.begin(async (tx) => {
      const tenant = await tx`SELECT id, slug, status FROM tenants WHERE id = ${tenantId} FOR UPDATE`;
      if (tenant.length !== 1 || tenant[0].slug !== tenantSlug || tenant[0].status !== "active") {
        throw new Error("tenant_not_active_or_mismatch");
      }
      const existing = await tx`
        SELECT database_key, status FROM tenant_database_registry
        WHERE tenant_id = ${tenantId} FOR UPDATE
      `;
      if (existing.length && existing[0].database_key !== databaseKey) {
        throw new Error("database_mapping_mismatch");
      }
      if (existing.length && existing[0].status === "active") {
        return { alreadyActive: true, databaseKey, ownerRole };
      }
      await tx`
        INSERT INTO tenant_database_registry
          (tenant_id, database_key, status, provision_attempts, last_error_code, updated_at)
        VALUES (${tenantId}, ${databaseKey}, 'provisioning', 1, NULL, now())
        ON CONFLICT (tenant_id) DO UPDATE SET
          status = 'provisioning',
          provision_attempts = tenant_database_registry.provision_attempts + 1,
          last_error_code = NULL,
          updated_at = now()
      `;
      return { alreadyActive: false, databaseKey, ownerRole };
    });
  } catch (error) {
    throw error;
  }

  if (reservation.alreadyActive) return { ...reservation, status: "active" };

  try {
    const roles = await admin`
      SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname = ${ownerRole}
    `;
    if (roles.length === 0) {
      await admin.unsafe(`CREATE ROLE ${quoteIdentifier(ownerRole)} NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT`);
    } else if (roles[0].rolcanlogin) {
      throw new Error("owner_role_must_not_login");
    }

    const databases = await admin`
      SELECT d.datname, pg_get_userbyid(d.datdba) AS owner
      FROM pg_database d WHERE d.datname = ${databaseKey}
    `;
    if (databases.length === 0) {
      await admin.unsafe(buildCreateDatabaseStatement(databaseKey, ownerRole));
    } else if (databases[0].owner !== ownerRole) {
      throw new Error("existing_database_owner_mismatch");
    }

    const verified = await admin`
      SELECT d.datname, pg_get_userbyid(d.datdba) AS owner
      FROM pg_database d WHERE d.datname = ${databaseKey}
    `;
    if (verified.length !== 1 || verified[0].owner !== ownerRole) {
      throw new Error("database_creation_verification_failed");
    }

    // PostgreSQL grants CONNECT to PUBLIC by default. Remove that cross-tenant
    // entry point and retain access for the local provisioning operator.
    for (const statement of buildTenantDatabaseConnectIsolationStatements(databaseKey)) {
      await admin.unsafe(statement);
    }

    await catalog`
      UPDATE tenant_database_registry
      SET status = 'provisioning', last_error_code = NULL, updated_at = now()
      WHERE tenant_id = ${tenantId} AND database_key = ${databaseKey}
    `;
    return { databaseKey, ownerRole, status: "provisioning" };
  } catch (error) {
    const code = /^[a-z0-9_]{1,80}$/.test(error.message) ? error.message : "database_provisioning_failed";
    await catalog`
      UPDATE tenant_database_registry
      SET status = 'failed', last_error_code = ${code}, updated_at = now()
      WHERE tenant_id = ${tenantId} AND database_key = ${databaseKey}
    `.catch(() => {});
    throw new Error(code);
  }
}
