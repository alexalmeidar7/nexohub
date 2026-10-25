import test from "node:test";
import assert from "node:assert/strict";
import { buildTenantRuntimeRole, generateRuntimePassword } from "../tenant-runtime-credentials.mjs";

test("runtime role name is deterministic and unique per tenant", () => {
  const a = buildTenantRuntimeRole("00000000-0000-4000-8000-000000000001");
  const b = buildTenantRuntimeRole("00000000-0000-4000-8000-000000000002");
  assert.match(a, /^hm_app_[a-f0-9]{32}$/);
  assert.notEqual(a, b);
});

test("runtime password is high entropy base64url and never derived from tenant identity", () => {
  const a = generateRuntimePassword();
  const b = generateRuntimePassword();
  assert.match(a, /^[A-Za-z0-9_-]{64}$/);
  assert.notEqual(a, b);
});
