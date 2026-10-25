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

test("diagnostic uses authenticated tenant database and returns only readiness", async () => {
  const calls = [];
  const handlers = mount({
    authenticateDevice(_req, _res, next) { next(); },
    tenantRuntime: {
      async openForAuthenticatedTenant(id) {
        calls.push(["open", id]);
        return {
          tenantId: id,
          databaseKey: "hm_" + "a".repeat(32),
          client: async () => { calls.push(["query"]); return [{ ready: 1 }]; },
        };
      },
    },
  });
  const res = response();
  let forwarded;
  await handlers[0]({ device: { tenant_id: tenantId } }, res, error => { forwarded = error; });
  await handlers[1]({ device: { tenant_id: tenantId } }, res, error => { forwarded = error; });
  assert.equal(forwarded, undefined);
  assert.deepEqual(calls, [["open", tenantId], ["query"]]);
  assert.deepEqual(res.payload, { ok: true, tenant_id: tenantId, database_ready: true });
  assert.equal(JSON.stringify(res.payload).includes("databaseKey"), false);
});

test("diagnostic fails closed when protected tenant runtime is not configured", () => {
  const handlers = mount({
    authenticateDevice(_req, _res, next) { next(); },
    tenantRuntime: null,
  });
  const res = response();
  handlers[1]({ device: { tenant_id: tenantId } }, res, () => {});
  assert.equal(res.statusCode, 503);
  assert.deepEqual(res.payload, { error: "tenant_runtime_not_configured" });
});

test("diagnostic rejects requests without authenticated device identity", async () => {
  const handlers = mount({
    authenticateDevice(_req, _res, next) { next(); },
    tenantRuntime: { async openForAuthenticatedTenant() { assert.fail("must not open"); } },
  });
  const res = response();
  await handlers[1]({ body: { tenant_id: tenantId } }, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload, { error: "authenticated_device_required" });
});
