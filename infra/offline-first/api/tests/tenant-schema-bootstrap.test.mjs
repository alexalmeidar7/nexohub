import test from "node:test";
import assert from "node:assert/strict";
import { buildTenantDatabaseUrl } from "../tenant-schema-bootstrap.mjs";
import { createDatabaseKey } from "../database-provisioning.mjs";

const tenantId = "00000000-0000-4000-8000-000000000001";
const key = createDatabaseKey(tenantId);

test("tenant bootstrap URL targets only a validated tenant database", () => {
  const result = new URL(buildTenantDatabaseUrl("postgres://operator:secret@127.0.0.1:5432/postgres?sslmode=disable", key));
  assert.equal(result.pathname, `/${key}`);
  assert.equal(result.hostname, "127.0.0.1");
  assert.equal(result.password, "secret");
  assert.equal(result.searchParams.get("sslmode"), "disable");
});

test("tenant bootstrap URL rejects arbitrary database names", () => {
  assert.throws(() => buildTenantDatabaseUrl("postgres://operator:secret@127.0.0.1:5432/postgres", "customer_db"));
  assert.throws(() => buildTenantDatabaseUrl("postgres://operator:secret@127.0.0.1:5432/postgres", "hm_a;DROP DATABASE postgres"));
});
