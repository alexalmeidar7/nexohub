import test from "node:test";
import assert from "node:assert/strict";
import { createDatabaseKey } from "../database-provisioning.mjs";
import { buildTenantRuntimeRole } from "../tenant-runtime-credentials.mjs";
import { createTenantRuntimeService } from "../tenant-runtime-service.mjs";

const tenantId = "00000000-0000-4000-8000-000000000001";
const databaseKey = createDatabaseKey(tenantId);
const runtimeRole = buildTenantRuntimeRole(tenantId);
const registryEntry = { tenant_id: tenantId, database_key: databaseKey, status: "active", schema_version: 1 };
const secret = { role: runtimeRole, password: "A".repeat(64) };

function dependencies(overrides = {}) {
  const calls = { registry: [], vault: [], postgres: [] };
  return {
    calls,
    controlPlaneDb: {
      unsafe: async (_query, params) => {
        calls.registry.push(params);
        return [registryEntry];
      },
    },
    secretVault: {
      getTenantRuntimeSecret: async (id) => {
        calls.vault.push(id);
        return secret;
      },
    },
    postgresFactory: (url, options) => {
      calls.postgres.push({ url, options });
      return { end: async () => {} };
    },
    controlPlaneUrl: "postgres://127.0.0.1:55432/housemix_local",
    ...overrides,
  };
}

test("opens a radio database using only authenticated tenant identity", async () => {
  const deps = dependencies();
  const service = createTenantRuntimeService(deps);
  const result = await service.openForAuthenticatedTenant(tenantId);
  assert.equal(result.tenantId, tenantId);
  assert.equal(result.databaseKey, databaseKey);
  assert.deepEqual(deps.calls.registry, [[tenantId]]);
  assert.deepEqual(deps.calls.vault, [tenantId]);
  assert.equal(deps.calls.postgres.length, 1);
  assert.match(deps.calls.postgres[0].url, new RegExp(databaseKey));
  assert.match(deps.calls.postgres[0].url, new RegExp(runtimeRole));
});

test("does not access registry, vault or database for invalid identity", async () => {
  const deps = dependencies();
  const service = createTenantRuntimeService(deps);
  await assert.rejects(() => service.openForAuthenticatedTenant("client-supplied-slug"));
  assert.deepEqual(deps.calls, { registry: [], vault: [], postgres: [] });
});

test("fails closed when the registry entry is not active", async () => {
  const deps = dependencies({
    controlPlaneDb: {
      unsafe: async (query, params) => {
        depsPlaceholder();
        return [{ ...registryEntry, status: "provisioning" }];
      },
    },
  });
  function depsPlaceholder() {}
  const service = createTenantRuntimeService(deps);
  await assert.rejects(() => service.openForAuthenticatedTenant(tenantId), /not_active/);
  assert.equal(deps.calls.postgres.length, 0);
});

test("fails closed when the protected vault has no secret", async () => {
  const deps = dependencies({
    secretVault: { getTenantRuntimeSecret: async () => null },
  });
  const service = createTenantRuntimeService(deps);
  await assert.rejects(() => service.openForAuthenticatedTenant(tenantId), /secret_invalid/);
  assert.equal(deps.calls.postgres.length, 0);
});

test("requires an explicit protected vault provider", () => {
  const deps = dependencies({ secretVault: null });
  assert.throws(() => createTenantRuntimeService(deps), /protected tenant runtime secret vault/);
});
