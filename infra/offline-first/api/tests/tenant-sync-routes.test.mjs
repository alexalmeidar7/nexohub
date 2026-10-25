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

test("sync push writes only to authenticated radio database", async () => {
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
  const res = response();
  await dispatch(routes.get("POST /v1/sync/outbox"), {
    device: { id: deviceId, tenant_id: tenantId },
    body: {
      aggregate_type: "program", aggregate_id: "p-1", operation: "upsert",
      payload: { title: "Morning" }, idempotency_key: "program-p1-key-0001",
      tenant_id: "00000000-0000-4000-8000-000000000099",
    },
  }, res);
  assert.equal(res.statusCode, 202);
  assert.equal(res.payload.accepted, true);
  assert.equal(statements.length, 1);
  assert.match(statements[0].sql, /housemix\.sync_outbox/);
  assert.doesNotMatch(statements[0].sql, /tenant_id/);
  assert.equal(statements[0].values.includes(deviceId), true);
});

test("sync pull reads only the authenticated radio database and uses a server checkpoint", async () => {
  const statements = [];
  const db = async () => [];
  db.begin = async (callback) => callback(async (strings, ...values) => {
    const sql = strings.join("?");
    statements.push({ sql, values });
    if (sql.includes("SELECT cursor_value, issued_cursor_value")) {
      return [{ cursor_value: null, issued_cursor_value: null }];
    }
    return [];
  });
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
  assert.deepEqual(res.payload, { changes: [], has_more: false, ack_cursor: null });
  assert.equal(statements.some(s => /FROM housemix\.sync_outbox/.test(s.sql)), true);
  assert.equal(statements.some(s => /tenant_id/.test(s.sql)), false);
});

test("sync pull rejects client-forged cursors", async () => {
  const db = async () => [];
  db.end = async () => {};
  const routes = setup({ async openForAuthenticatedTenant() {
    return { tenantId, databaseKey: "hm_test", client: db };
  }});
  const res = response();
  await dispatch(routes.get("GET /v1/sync/changes"), {
    device: { id: deviceId, tenant_id: tenantId }, query: { cursor: "forged" },
  }, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload, { error: "server_managed_checkpoint_required" });
});

test("sync acknowledgement advances only a cursor issued to that device", async () => {
  const issued = Buffer.from(JSON.stringify({
    version: 4, created_at_us: "1792963200000000",
    id: "00000000-0000-4000-8000-000000000003",
  })).toString("base64url");
  const db = async (strings, ...values) => {
    assert.match(strings.join("?"), /UPDATE housemix\.sync_checkpoints/);
    assert.equal(values.includes(deviceId), true);
    assert.equal(values.includes(issued), true);
    return [{ cursor_value: issued }];
  };
  db.end = async () => {};
  const routes = setup({ async openForAuthenticatedTenant() {
    return { tenantId, databaseKey: "hm_test", client: db };
  }});
  const res = response();
  await dispatch(routes.get("POST /v1/sync/ack"), {
    device: { id: deviceId, tenant_id: tenantId }, body: { ack_cursor: issued },
  }, res);
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.payload, { acknowledged: true });
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
