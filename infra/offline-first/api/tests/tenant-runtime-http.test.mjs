import test from "node:test";
import assert from "node:assert/strict";
import { withAuthenticatedTenantRuntime } from "../tenant-runtime-http.mjs";

const tenantId = "00000000-0000-4000-8000-000000000001";

function response() {
  return {
    statusCode: 200,
    payload: null,
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
  };
}

test("uses authenticated device tenant and closes the scoped client after success", async () => {
  const calls = { opened: [], ended: [], handled: null };
  const client = { end: async (options) => calls.ended.push(options) };
  const wrapped = withAuthenticatedTenantRuntime({
    tenantRuntime: {
      openForAuthenticatedTenant: async (id) => {
        calls.opened.push(id);
        return { tenantId: id, databaseKey: "hm_" + "a".repeat(32), client };
      },
    },
    handler: async (req, res) => {
      calls.handled = req.tenantRuntime;
      res.json({ ok: true });
    },
  });
  const req = {
    device: { tenant_id: tenantId },
    body: { tenant_id: "00000000-0000-4000-8000-000000000002" },
    query: { tenant_id: "00000000-0000-4000-8000-000000000003" },
  };
  const res = response();
  let nextError;
  await wrapped(req, res, (error) => { nextError = error; });

  assert.equal(nextError, undefined);
  assert.deepEqual(calls.opened, [tenantId]);
  assert.equal(calls.handled.tenantId, tenantId);
  assert.equal(calls.handled.db, client);
  assert.deepEqual(calls.ended, [{ timeout: 5 }]);
  assert.equal(req.tenantRuntime, undefined);
  assert.deepEqual(res.payload, { ok: true });
});

test("rejects missing authenticated device context without opening a database", async () => {
  let opened = false;
  const wrapped = withAuthenticatedTenantRuntime({
    tenantRuntime: { openForAuthenticatedTenant: async () => { opened = true; } },
    handler: async () => {},
  });
  const res = response();
  await wrapped({ body: { tenant_id: tenantId } }, res, () => {});
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.payload, { error: "authenticated_device_required" });
  assert.equal(opened, false);
});

test("closes the tenant client and forwards handler errors", async () => {
  let ended = 0;
  const expected = new Error("handler_failed");
  const wrapped = withAuthenticatedTenantRuntime({
    tenantRuntime: {
      openForAuthenticatedTenant: async (id) => ({
        tenantId: id,
        databaseKey: "hm_" + "a".repeat(32),
        client: { end: async () => { ended += 1; } },
      }),
    },
    handler: async () => { throw expected; },
  });
  let forwarded;
  await wrapped({ device: { tenant_id: tenantId } }, response(), (error) => { forwarded = error; });
  assert.equal(forwarded, expected);
  assert.equal(ended, 1);
});

test("fails closed and closes the client if runtime identity does not match", async () => {
  let ended = 0;
  const wrapped = withAuthenticatedTenantRuntime({
    tenantRuntime: {
      openForAuthenticatedTenant: async () => ({
        tenantId: "00000000-0000-4000-8000-000000000002",
        databaseKey: "hm_" + "b".repeat(32),
        client: { end: async () => { ended += 1; } },
      }),
    },
    handler: async () => assert.fail("handler must not run"),
  });
  let forwarded;
  await wrapped({ device: { tenant_id: tenantId } }, response(), (error) => { forwarded = error; });
  assert.match(forwarded.message, /tenant_runtime_unavailable/);
  assert.equal(ended, 1);
});
