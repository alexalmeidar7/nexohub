import test from "node:test";
import assert from "node:assert/strict";
import { mountTenantSyncRoutes } from "../tenant-sync-routes.mjs";

const tenantId = "00000000-0000-4000-8000-000000000001";
const deviceId = "00000000-0000-4000-8000-000000000002";

function response() {
  return {
    statusCode: 200, payload: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
  };
}
function setup(tenantRuntime) {
  const routes = new Map();
  mountTenantSyncRoutes({
    post(path, ...handlers) { routes.set("POST " + path, handlers); },
    get(path, ...handlers) { routes.set("GET " + path, handlers); },
  }, {
    authenticateDevice(_req, _res, next) { next(); },
    tenantRuntime,
  });
  return routes;
}
async function dispatch(handlers, req, res) {
  let pending;
  handlers[0](req, res, () => {
    pending = handlers[1](req, res, (error) => { if (error) throw error; });
  });
  if (pending) await pending;
}

test("sync push writes only to authenticated radio database and is idempotent", async () => {
  const statements = [];
  const db = async (strings, ...values) => {
    const sql = strings.join("?");
    statements.push({ sql, values });
    if (sql.includes("INSERT INTO housemix.sync_outbox")) return [{
      id: "00000000-0000-4000-8000-000000000003",
      aggregate_type: "program", aggregate_id: "p-1", operation: "upsert",
    }];
    return [];
  };
  db.json = (value) => value;
  db.end = async () => {};
  const routes = setup({ async openForAuthenticatedTenant(id) {
    assert.equal(id, tenantId);
    return { tenantId, databaseKey: "hm_test", client: db };
  }});
  const req = {
    device: { id: deviceId, tenant_id: tenantId },
    body: {
      aggregate_type: "program", aggregate_id: "p-1", operation: "upsert",
      payload: { title: "Morning" }, idempotency_key: "program-p1-key-0001",
      tenant_id: "00000000-0000-4000-8000-000000000099",
    },
  };
  const res = response();
  await dispatch(routes.get("POST /v1/sync/outbox"), req, res);
  assert.equal(res.statusCode, 202);
  assert.equal(res.payload.accepted, true);
  assert.equal(statements.length, 1);
  assert.match(statements[0].sql, /housemix\.sync_outbox/);
  assert.doesNotMatch(statements[0].sql, /tenant_id/);
  assert.equal(statements[0].values.includes(deviceId), true);
});

test("sync pull reads only from the authenticated radio database", async () => {
  const statements = [];
  const db = async (strings, ...values) => {
    statements.push({ sql: strings.join("?"), values });
    return [];
  };
  db.end = async () => {};
  const routes = setup({ async openForAuthenticatedTenant(id) {
    assert.equal(id, tenantId);
    return { tenantId, databaseKey: "hm_test", client: db };
  }});
  const res = response();
  await dispatch(routes.get("GET /v1/sync/changes"), {
    device: { id: deviceId, tenant_id: tenantId }, query: { limit: "50" },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { changes: [], has_more: false, next_cursor: null });
  assert.match(statements[0].sql, /FROM housemix\.sync_outbox/);
  assert.doesNotMatch(statements[0].sql, /tenant_id/);
});

test("sync endpoints fail closed until the protected tenant runtime is configured", async () => {
  const routes = setup(null);
  const res = response();
  await dispatch(routes.get("POST /v1/sync/outbox"), {
    device: { id: deviceId, tenant_id: tenantId }, body: {},
  }, res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.payload, { error: "tenant_runtime_not_configured" });
});
