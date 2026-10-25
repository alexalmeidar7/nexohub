import test from "node:test";
import assert from "node:assert/strict";
import {
  expectedTenantSchemaChecksum,
  validateTenantDatabaseActivationSnapshot,
} from "../tenant-database-activation.mjs";

const tenant = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "radio-positiva",
  status: "active",
};
const databaseKey = "hm_11e594f481958c10e3015d0bf0447a22";
const runtimeRole = {
  rolname: "hm_app_11e594f481958c10e3015d0bf0447a22",
  rolcanlogin: true, rolsuper: false, rolcreatedb: false,
  rolcreaterole: false, rolreplication: false, rolbypassrls: false,
};
const valid = {
  tenant, databaseKey,
  databaseOwner: "hm_owner_11e594f481958c10e3015d0bf0447a22",
  migration: { version: 1, checksum_sha256: "a".repeat(64) },
  runtimeRole, memberships: [], publicCanConnect: false,
  runtimeCanConnect: true, runtimeCanUseSchema: true,
};

test("activation accepts only a fully verified isolated tenant database", () => {
  assert.deepEqual(validateTenantDatabaseActivationSnapshot(valid), {
    ready: true, databaseKey, runtimeRole: runtimeRole.rolname,
  });
});

test("activation rejects public database connection access", () => {
  assert.throws(() => validateTenantDatabaseActivationSnapshot({
    ...valid, publicCanConnect: true,
  }), /tenant_database_public_connect_enabled/);
});

test("activation rejects runtime roles with inherited memberships", () => {
  assert.throws(() => validateTenantDatabaseActivationSnapshot({
    ...valid, memberships: [{ role: "pg_read_all_data" }],
  }), /tenant_runtime_role_has_memberships/);
});

test("activation rejects elevated runtime role privileges", () => {
  assert.throws(() => validateTenantDatabaseActivationSnapshot({
    ...valid, runtimeRole: { ...runtimeRole, rolsuper: true },
  }), /tenant_runtime_role_not_least_privilege/);
});

test("activation rejects missing or invalid schema migration", () => {
  assert.throws(() => validateTenantDatabaseActivationSnapshot({
    ...valid, migration: null,
  }), /tenant_schema_not_initialized/);
});

test("activation rejects schema checksum mismatch before status change", () => {
  assert.notEqual(expectedTenantSchemaChecksum("schema-a"), expectedTenantSchemaChecksum("schema-b"));
  assert.throws(() => validateTenantDatabaseActivationSnapshot({
    ...valid, migration: { version: 1, checksum_sha256: "b".repeat(64) },
  }), /tenant_schema_not_initialized/);
});

test("activation rejects an incorrect tenant/database mapping", () => {
  assert.throws(() => validateTenantDatabaseActivationSnapshot({
    ...valid, databaseKey: "hm_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  }), /tenant_database_mapping_mismatch/);
});

test("activation rejects missing runtime database grants", () => {
  assert.throws(() => validateTenantDatabaseActivationSnapshot({
    ...valid, runtimeCanConnect: false,
  }), /tenant_runtime_role_grants_incomplete/);
});
