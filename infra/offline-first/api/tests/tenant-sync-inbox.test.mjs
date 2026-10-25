import test from "node:test";
import assert from "node:assert/strict";
import { mountTenantSyncRoutes } from "../tenant-sync-routes.mjs";

const tenantId = "00000000-0000-4000-8000-000000000001";
const deviceId = "00000000-0000-4000-8000-000000000002";
const mutationId = "00000000-0000-4000-8000-000000000003";

function response() {
  return {
    statusCode: 200, payload: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
  };
}
function setup(db) {
  const routes = new Map();
  mountTenantSyncRoutes({
    post(path, ...handlers) { routes.set("POST " + path, handlers); },
    get(path, ...handlers) { routes.set("GET " + path, handlers); },
  }, {
    authenticateDevice(_req, _res, next) { next(); },
    tenantRuntime: { async openForAuthenticatedTenant(id) {
      assert.equal(id, tenantId);
      return { tenantId, databaseKey: "hm_test", client: db };
    }},
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

test("inbox stores remote mutation only in authenticated radio database", async () => {
  let captured;
  const db = async (strings, ...values) => {
    captured = { sql: strings.join("?"), values };
    return [{ id: "inbox-row", mutation_id: mutationId, status: "pending" }];
  };
  db.json = (value) => value;
  db.end = async () => {};
  const routes = setup(db);
  const res = response();
  await dispatch(routes.get("POST /v1/sync/inbox"), {
    device: { id: deviceId, tenant_id: tenantId },
    body: {
      mutation_id: mutationId, source: "housemix-cloud",
      aggregate_type: "program", aggregate_id: "program-7",
      operation: "upsert", payload: { title: "Morning" },
      base_version: 4, schema_version: 1,
      tenant_id: "00000000-0000-4000-8000-000000000099",
    },
  }, res);
  assert.equal(res.statusCode, 202);
  assert.equal(res.payload.accepted, true);
  assert.equal(captured.values.includes(deviceId), true);
  assert.equal(captured.values.includes(mutationId), true);
  assert.match(captured.sql, /INSERT INTO housemix\.sync_inbox/);
  assert.doesNotMatch(captured.sql, /tenant_id/);
});

test("inbox rejects invalid mutation envelopes before database access", async () => {
  let called = false;
  const db = async () => { called = true; return []; };
  db.end = async () => {};
  const routes = setup(db);
  const res = response();
  await dispatch(routes.get("POST /v1/sync/inbox"), {
    device: { id: deviceId, tenant_id: tenantId },
    body: { mutation_id: "not-a-uuid", operation: "upsert" },
  }, res);
  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.payload, { error: "invalid_inbox_mutation" });
  assert.equal(called, false);
});
