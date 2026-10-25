import test from "node:test";
import assert from "node:assert/strict";
import { mountTenantDiagnosticRoute } from "../tenant-diagnostic-route.mjs";

const tenantId = "00000000-0000-4000-8000-000000000001";

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
  };
}

function mount(options) {
  const routes = new Map();
  mountTenantDiagnosticRoute({
    get(path, ...handlers) { routes.set(path, handlers); },
  }, options);
  return routes.get("/v1/tenant/diagnostics");
}

// Express invokes the route handler only when authentication calls next().
async function dispatch(handlers, req, res) {
  let downstream;
  handlers[0](req, res, () => {
    downstream = handlers[1](req, res, error => {
      if (error) throw error;
    });
  });
  if (downstream) await downstream;
}

test("diagnostic uses authenticated tenant database and returns only readiness", async () => {
  const calls = [];
  const handlers = mount({
    authenticateDevice(_req, _res, next) { next(); },
    tenantRuntime: {
      async openForAuthenticatedTenant(id) {
        calls.push(["open", id]);
        const client = async () => { calls.push(["query"]); return [{ ready: 1 }]; };
        client.end = async () => { calls.push(["close"]); };
        return { tenantId: id, databaseKey: "hm_" + "a".repeat(32), client };
      },
    },
  });
  const res = response();
  const req = { device: { tenant_id: tenantId } };
  await dispatch(handlers, req, res);
  assert.deepEqual(calls.map(call => call[0]), ["open", "query", "close"]);
  assert.equal(calls[0][1], tenantId);
  assert.deepEqual(res.payload, { ok: true, tenant_id: tenantId, database_ready: true });
  assert.equal(JSON.stringify(res.payload).includes("databaseKey"), false);
  assert.equal("tenantRuntime" in req, false);
});

test("diagnostic fails closed when protected tenant runtime is not configured", async () => {
  const handlers = mount({
    authenticateDevice(_req, _res, next) { next(); },
    tenantRuntime: null,
  });
  const res = response();
  await dispatch(handlers, {}, res);
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.payload, { error: "tenant_runtime_not_configured" });
});

test("diagnostic rejects requests without authenticated device identity", async () => {
  const handlers = mount({
    authenticateDevice(_req, _res, next) { next(); },
    tenantRuntime: { async openForAuthenticatedTenant() { assert.fail("must not open"); } },
  });
  const res = response();
  await dispatch(handlers, { body: { tenant_id: tenantId } }, res);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload, { error: "authenticated_device_required" });
});
