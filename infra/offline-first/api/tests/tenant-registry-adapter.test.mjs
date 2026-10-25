import test from "node:test";
import assert from "node:assert/strict";
import { createDatabaseKey } from "../database-provisioning.mjs";
import { createTenantRegistryLookup } from "../tenant-registry-adapter.mjs";

const tenantId = "00000000-0000-4000-8000-000000000001";
const entry = {
  tenant_id: tenantId,
  database_key: createDatabaseKey(tenantId),
  status: "active",
  schema_version: 1,
};

test("looks up only the authenticated tenant UUID", async () => {
  const calls = [];
  const find = createTenantRegistryLookup({
    unsafe: async (query, parameters) => {
      calls.push({ query, parameters });
      return [entry];
    },
  });
  assert.deepEqual(await find(tenantId), {
    ...entry,
    schema_version: 1,
  });
  assert.deepEqual(calls[0].parameters, [tenantId]);
  assert.match(calls[0].query, /WHERE tenant_id = \$1/);
});

test("returns null when tenant has no database registry entry", async () => {
  const find = createTenantRegistryLookup({ unsafe: async () => [] });
  assert.equal(await find(tenantId), null);
});

test("rejects malformed or client-controlled tenant identifiers", async () => {
  let queried = false;
  const find = createTenantRegistryLookup({
    unsafe: async () => { queried = true; return [entry]; },
  });
  await assert.rejects(() => find("radio-positiva"), /authenticated tenant UUID/);
  assert.equal(queried, false);
});

test("fails closed when registry database key maps to another tenant", async () => {
  const find = createTenantRegistryLookup({
    unsafe: async () => [{ ...entry, database_key: "hm_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }],
  });
  await assert.rejects(() => find(tenantId), /tenant_database_registry_mapping_mismatch/);
});

test("does not rewrite inactive registry status", async () => {
  const find = createTenantRegistryLookup({
    unsafe: async () => [{ ...entry, status: "provisioning" }],
  });
  const result = await find(tenantId);
  assert.equal(result.status, "provisioning");
});
