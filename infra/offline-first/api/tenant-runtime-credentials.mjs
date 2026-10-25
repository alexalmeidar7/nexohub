import crypto from "node:crypto";
import { createDatabaseKey, validateDatabaseKey } from "./database-provisioning.mjs";
import { buildTenantOwnerRole } from "./postgres-tenant-provisioner.mjs";

const quoteIdentifier = (value) => `"${value.replaceAll('"', '""')}"`;
const quoteLiteral = (value) => `'${value.replaceAll("'", "''")}'`;

export function buildTenantRuntimeRole(tenantId) {
  return `hm_app_${createDatabaseKey(tenantId).slice(3)}`;
}

export function generateRuntimePassword() {
  return crypto.randomBytes(48).toString("base64url");
}

export function buildRuntimeRoleMembershipRevocations(runtimeRole, memberships) {
  if (typeof runtimeRole !== "string" || !/^hm_app_[a-f0-9]{32}$/.test(runtimeRole)) {
    throw new TypeError("Invalid server-generated runtime role");
  }
  return memberships.map(({ grantedRole, memberRole }) => {
    if (typeof grantedRole !== "string" || typeof memberRole !== "string" ||
        !/^[a-zA-Z0-9_]+$/.test(grantedRole) || !/^[a-zA-Z0-9_]+$/.test(memberRole)) {
      throw new TypeError("Invalid PostgreSQL role membership");
    }
    if (grantedRole !== runtimeRole && memberRole !== runtimeRole) {
      throw new Error("runtime_role_membership_scope_mismatch");
    }
    return `REVOKE ${quoteIdentifier(grantedRole)} FROM ${quoteIdentifier(memberRole)}`;
  });
}

export async function provisionTenantRuntimeCredentials({ admin, tenantDb, tenant, databaseKey, password = generateRuntimePassword() }) {
  validateDatabaseKey(databaseKey);
  if (createDatabaseKey(tenant.id) !== databaseKey) throw new Error("tenant_database_mapping_mismatch");
  if (typeof password !== "string" || password.length < 48 || !/^[A-Za-z0-9_-]+$/.test(password)) {
    throw new TypeError("Runtime password must be a high-entropy base64url secret");
  }

  const ownerRole = buildTenantOwnerRole(tenant.id);
  const runtimeRole = buildTenantRuntimeRole(tenant.id);
  const databases = await admin`
    SELECT d.datname, pg_get_userbyid(d.datdba) AS owner
    FROM pg_database d WHERE d.datname = ${databaseKey}
  `;
  if (databases.length !== 1 || databases[0].owner !== ownerRole) {
    throw new Error("tenant_database_owner_verification_failed");
  }

  const memberships = await admin`
    SELECT granted.rolname AS "grantedRole", member.rolname AS "memberRole"
    FROM pg_auth_members m
    JOIN pg_roles granted ON granted.oid = m.roleid
    JOIN pg_roles member ON member.oid = m.member
    WHERE granted.rolname = ${runtimeRole} OR member.rolname = ${runtimeRole}
  `;
  for (const statement of buildRuntimeRoleMembershipRevocations(runtimeRole, memberships)) {
    await admin.unsafe(statement);
  }

  const roles = await admin`SELECT rolname, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls FROM pg_roles WHERE rolname = ${runtimeRole}`;
  if (roles.length && (roles[0].rolsuper || roles[0].rolcreatedb || roles[0].rolcreaterole || roles[0].rolreplication || roles[0].rolbypassrls)) {
    throw new Error("runtime_role_privilege_escalation_detected");
  }

  if (!roles.length) {
    await admin.unsafe(`CREATE ROLE ${quoteIdentifier(runtimeRole)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD ${quoteLiteral(password)}`);
  } else {
    await admin.unsafe(`ALTER ROLE ${quoteIdentifier(runtimeRole)} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD ${quoteLiteral(password)}`);
  }

  await admin.unsafe(`REVOKE CONNECT ON DATABASE ${quoteIdentifier(databaseKey)} FROM PUBLIC`);
  await admin.unsafe(`GRANT CONNECT ON DATABASE ${quoteIdentifier(databaseKey)} TO CURRENT_USER`);
  await admin.unsafe(`GRANT CONNECT ON DATABASE ${quoteIdentifier(databaseKey)} TO ${quoteIdentifier(runtimeRole)}`);
  await tenantDb.unsafe(`GRANT USAGE ON SCHEMA housemix TO ${quoteIdentifier(runtimeRole)}`);
  await tenantDb.unsafe(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA housemix TO ${quoteIdentifier(runtimeRole)}`);
  await tenantDb.unsafe(`GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA housemix TO ${quoteIdentifier(runtimeRole)}`);
  await tenantDb.unsafe(`ALTER DEFAULT PRIVILEGES FOR ROLE ${quoteIdentifier(ownerRole)} IN SCHEMA housemix GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${quoteIdentifier(runtimeRole)}`);
  await tenantDb.unsafe(`ALTER DEFAULT PRIVILEGES FOR ROLE ${quoteIdentifier(ownerRole)} IN SCHEMA housemix GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${quoteIdentifier(runtimeRole)}`);

  const verified = await tenantDb`
    SELECT r.rolcanlogin, r.rolsuper, r.rolcreatedb, r.rolcreaterole,
           has_database_privilege(r.rolname, ${databaseKey}, 'CONNECT') AS can_connect,
           has_schema_privilege(r.rolname, 'housemix', 'USAGE') AS can_use_schema,
           has_schema_privilege(r.rolname, 'public', 'CREATE') AS can_create_public
    FROM pg_roles r WHERE r.rolname = ${runtimeRole}
  `;
  if (verified.length !== 1 || !verified[0].rolcanlogin || verified[0].rolsuper ||
      verified[0].rolcreatedb || verified[0].rolcreaterole || !verified[0].can_connect ||
      !verified[0].can_use_schema || verified[0].can_create_public) {
    throw new Error("runtime_role_privilege_verification_failed");
  }

  return { databaseKey, runtimeRole, status: "credentials_ready", password };
}
