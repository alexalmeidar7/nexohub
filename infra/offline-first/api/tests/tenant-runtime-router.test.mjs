import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTenantRuntimeConnectionConfig,
  createTenantDatabaseClient,
} from "../tenant-runtime-router.mjs";

const tenantId = "00000000-0000-4000-8000-000000000001";
const databaseKey = "hm_11e594f481958c10e3015d0bf0447a22";
const role = "hm_app_11e594f481958c10e3015d0bf0447a22";
const registryEntry = { tenant_id: tenantId, database_key: databaseKey, status: "active" };
const runtimeSecret = { role, password: "a".repeat(64) };
const valid = {
  tenantId, registryEntry, runtimeSecret,
  controlPlaneUrl: "postgres://catalog@127.0.0.1:55432/housemix_local",
};

test("builds a tenant-specific connection from authenticated tenant identity", () => {
  const config = buildTenantRuntimeConnectionConfig(valid);
  const url = new URL(config.connectionString);
  assert.equal(url.pathname, `/${databaseKey}`);
  assert.equal(url.username, role);
  assert.equal(url.password, runtimeSecret.password);
  assert.equal(config.max, 10);
  assert.equal(config.prepare, false);
});

test("rejects inactive tenant database", () => {
  assert.throws(() => buildTenantRuntimeConnectionConfig({
    ...valid, registryEntry: { ...registryEntry, status: "provisioning" },
  }), /tenant_database_not_active/);
});

test("rejects cross-tenant registry mapping", () => {
  assert.throws(() => buildTenantRuntimeConnectionConfig({
    ...valid, registryEntry: { ...registryEntry, tenant_id: "00000000-0000-4000-8000-000000000002" },
  }), /tenant_database_not_active/);
});

test("rejects a database key that does not match authenticated tenant", () => {
  assert.throws(() => buildTenantRuntimeConnectionConfig({
    ...valid, registryEntry: { ...registryEntry, database_key: "hm_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
  }), /tenant_database_not_active/);
});

test("rejects runtime secret belonging to another tenant role", () => {
  assert.throws(() => buildTenantRuntimeConnectionConfig({
    ...valid, runtimeSecret: { ...runtimeSecret, role: "hm_app_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
  }), /tenant_runtime_secret_invalid/);
});

test("rejects remote or unexpected database hosts", () => {
  assert.throws(() => buildTenantRuntimeConnectionConfig({
    ...valid, controlPlaneUrl: "postgres://catalog@db.example.com/housemix",
  }), /tenant_database_connection_origin_not_allowed/);
});

test("rejects URL credentials supplied by the control plane URL", () => {
  assert.throws(() => buildTenantRuntimeConnectionConfig({
    ...valid, controlPlaneUrl: "postgres://admin:secret@127.0.0.1:55432/catalog",
  }), /tenant_database_connection_origin_not_allowed/);
});

test("uses authenticated tenant id for registry and secret lookups", async () => {
  const calls = [];
  const fakeClient = { end: async () => {} };
  const result = await createTenantDatabaseClient({
    authenticatedTenantId: tenantId,
    findRegistryEntry: async (id) => { calls.push(["registry", id]); return registryEntry; },
    getRuntimeSecret: async (id) => { calls.push(["secret", id]); return runtimeSecret; },
    controlPlaneUrl: valid.controlPlaneUrl,
    postgresFactory: (url, options) => {
      assert.equal(new URL(url).pathname, `/${databaseKey}`);
      assert.equal(options.max, 10);
      return fakeClient;
    },
  });
  assert.deepEqual(calls, [["registry", tenantId], ["secret", tenantId]]);
  assert.equal(result.client, fakeClient);
  assert.equal(result.databaseKey, databaseKey);
});

test("does not create a connection when tenant database is not active", async () => {
  let connected = false;
  await assert.rejects(() => createTenantDatabaseClient({
    authenticatedTenantId: tenantId,
    findRegistryEntry: async () => ({ ...registryEntry, status: "provisioning" }),
    getRuntimeSecret: async () => runtimeSecret,
    controlPlaneUrl: valid.controlPlaneUrl,
    postgresFactory: () => { connected = true; },
  }), /tenant_database_not_active/);
  assert.equal(connected, false);
});
