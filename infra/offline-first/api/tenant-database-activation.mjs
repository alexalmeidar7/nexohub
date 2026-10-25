import crypto from "node:crypto";
import { createDatabaseKey } from "./database-provisioning.mjs";
import { buildTenantOwnerRole } from "./postgres-tenant-provisioner.mjs";
import { buildTenantRuntimeRole } from "./tenant-runtime-credentials.mjs";

export function validateTenantDatabaseActivationSnapshot({
  tenant, databaseKey, databaseOwner, migration, runtimeRole, memberships,
  publicCanConnect, runtimeCanConnect, runtimeCanUseSchema,
}) {
  if (!tenant || tenant.status !== "active" || createDatabaseKey(tenant.id) !== databaseKey) {
    throw new Error("tenant_database_mapping_mismatch");
  }
  if (databaseOwner !== buildTenantOwnerRole(tenant.id)) {
    throw new Error("tenant_database_owner_verification_failed");
  }
  if (!migration || migration.version !== 1 || !/^[a-f0-9]{64}$/.test(migration.checksum_sha256 ?? "")) {
    throw new Error("tenant_schema_not_initialized");
  }
  if (!runtimeRole || runtimeRole.rolname !== buildTenantRuntimeRole(tenant.id) ||
      !runtimeRole.rolcanlogin || runtimeRole.rolsuper || runtimeRole.rolcreatedb ||
      runtimeRole.rolcreaterole || runtimeRole.rolreplication || runtimeRole.rolbypassrls) {
    throw new Error("tenant_runtime_role_not_least_privilege");
  }
  if (memberships?.length) throw new Error("tenant_runtime_role_has_memberships");
  if (publicCanConnect) throw new Error("tenant_database_public_connect_enabled");
  if (!runtimeCanConnect || !runtimeCanUseSchema) {
    throw new Error("tenant_runtime_role_grants_incomplete");
  }
  return { ready: true, databaseKey, runtimeRole: runtimeRole.rolname };
}

export function expectedTenantSchemaChecksum(migrationSql) {
  return crypto.createHash("sha256").update(migrationSql).digest("hex");
}

export async function activateTenantDatabase({ catalog, admin, tenantDb, tenant, databaseKey, migrationSql }) {
  const ownerRole = buildTenantOwnerRole(tenant.id);
  const runtimeRoleName = buildTenantRuntimeRole(tenant.id);
  const expectedChecksum = expectedTenantSchemaChecksum(migrationSql);

  const databases = await admin`
    SELECT pg_get_userbyid(d.datdba) AS owner,
           COALESCE((
             SELECT bool_or(x.grantee = 0 AND x.privilege_type = 'CONNECT')
             FROM aclexplode(COALESCE(d.datacl, acldefault('d', d.datdba))) x
           ), false) AS public_can_connect
    FROM pg_database d WHERE d.datname = ${databaseKey}
  `;
  if (databases.length !== 1) throw new Error("tenant_database_not_found");

  const migrations = await tenantDb`
    SELECT version, checksum_sha256
    FROM housemix.schema_migrations WHERE version = 1
  `;
  if (migrations.length !== 1 || migrations[0].checksum_sha256 !== expectedChecksum) {
    throw new Error("tenant_schema_checksum_verification_failed");
  }

  const roles = await admin`
    SELECT rolname, rolcanlogin, rolsuper, rolcreatedb, rolcreaterole,
           rolreplication, rolbypassrls
    FROM pg_roles WHERE rolname = ${runtimeRoleName}
  `;
  const memberships = await admin`
    SELECT 1 FROM pg_auth_members m
    JOIN pg_roles granted ON granted.oid = m.roleid
    JOIN pg_roles member ON member.oid = m.member
    WHERE granted.rolname = ${runtimeRoleName} OR member.rolname = ${runtimeRoleName}
  `;
  const grants = await tenantDb`
    SELECT has_database_privilege(${runtimeRoleName}, ${databaseKey}, 'CONNECT') AS can_connect,
           has_schema_privilege(${runtimeRoleName}, 'housemix', 'USAGE') AS can_use_schema
  `;
  validateTenantDatabaseActivationSnapshot({
    tenant, databaseKey, databaseOwner: databases[0].owner,
    migration: migrations[0], runtimeRole: roles[0], memberships,
    publicCanConnect: databases[0].public_can_connect,
    runtimeCanConnect: grants[0]?.can_connect,
    runtimeCanUseSchema: grants[0]?.can_use_schema,
  });

  const updated = await catalog`
    UPDATE tenant_database_registry
    SET status = 'active', last_error_code = NULL, updated_at = now()
    WHERE tenant_id = ${tenant.id}
      AND database_key = ${databaseKey}
      AND status = 'provisioning'
    RETURNING tenant_id
  `;
  if (updated.length !== 1) throw new Error("tenant_database_activation_state_conflict");
  return { status: "active", databaseKey, runtimeRole: runtimeRoleName };
}
