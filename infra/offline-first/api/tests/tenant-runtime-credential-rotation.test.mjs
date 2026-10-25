import test from "node:test";
import assert from "node:assert/strict";
import { rotateTenantRuntimeCredentials } from "../tenant-runtime-credential-rotation.mjs";

const tenant = {
  id: "00000000-0000-4000-8000-000000000001",
  slug: "radio-positiva",
  status: "active",
  database_key: "hm_00000000000040008000000000000001",
};

test("rotation delegates only for an active tenant with matching database mapping", async () => {
  let received;
  const result = await rotateTenantRuntimeCredentials({
    admin: "admin",
    tenantDb: "tenant-db",
    tenant,
    databaseKey: tenant.database_key,
    password: "a".repeat(64),
    provision: async (args) => {
      received = args;
      return { databaseKey: args.databaseKey, runtimeRole: "hm_app_test", password: args.password, status: "credentials_ready" };
    },
  });

  assert.equal(received.tenant, tenant);
  assert.equal(received.admin, "admin");
  assert.equal(result.status, "credentials_rotated");
  assert.equal(result.password, "a".repeat(64));
});

test("rotation rejects tenants that are not active", async () => {
  await assert.rejects(
    rotateTenantRuntimeCredentials({
      admin: {}, tenantDb: {}, tenant: { ...tenant, status: "provisioning" },
      databaseKey: tenant.database_key, provision: async () => assert.fail("must not provision"),
    }),
    /tenant_must_be_active_for_credential_rotation/,
  );
});

test("rotation rejects a mismatched tenant database key", async () => {
  await assert.rejects(
    rotateTenantRuntimeCredentials({
      admin: {}, tenantDb: {}, tenant,
      databaseKey: "hm_ffffffffffffffffffffffffffffffff",
      provision: async () => assert.fail("must not provision"),
    }),
    /tenant_database_mapping_mismatch/,
  );
});
