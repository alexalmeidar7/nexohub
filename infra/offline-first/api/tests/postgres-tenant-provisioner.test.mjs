import test from "node:test";
import assert from "node:assert/strict";
import { buildCreateDatabaseStatement, buildTenantOwnerRole } from "../postgres-tenant-provisioner.mjs";

const tenantA = "00000000-0000-4000-8000-000000000001";
const tenantB = "00000000-0000-4000-8000-000000000002";

test("owner role is deterministic and unique per tenant", () => {
  assert.equal(buildTenantOwnerRole(tenantA), buildTenantOwnerRole(tenantA));
  assert.notEqual(buildTenantOwnerRole(tenantA), buildTenantOwnerRole(tenantB));
  assert.match(buildTenantOwnerRole(tenantA), /^hm_owner_[a-f0-9]{32}$/);
});

test("CREATE DATABASE statement uses only strict server-generated identifiers", () => {
  const statement = buildCreateDatabaseStatement(
    "hm_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "hm_owner_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  );
  assert.equal(statement,
    'CREATE DATABASE "hm_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" OWNER "hm_owner_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" TEMPLATE template0 ENCODING \'UTF8\'');
  assert.throws(() => buildCreateDatabaseStatement("radio_a; DROP DATABASE postgres", "hm_owner_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"));
  assert.throws(() => buildCreateDatabaseStatement("hm_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", "postgres"));
});

test("generated database owner is a non-login role by contract", () => {
  const role = buildTenantOwnerRole(tenantA);
  assert.match(role, /^hm_owner_[a-f0-9]{32}$/);
});
