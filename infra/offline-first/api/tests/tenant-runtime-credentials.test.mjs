import test from "node:test";
import assert from "node:assert/strict";
import { buildRuntimeRoleMembershipRevocations, buildTenantRuntimeRole, generateRuntimePassword } from "../tenant-runtime-credentials.mjs";

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

test("runtime role membership is removed in either direction", () => {
  const runtime = "hm_app_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  assert.deepEqual(
    buildRuntimeRoleMembershipRevocations(runtime, [
      { grantedRole: "pg_read_all_data", memberRole: runtime },
      { grantedRole: runtime, memberRole: "unexpected_member" },
    ]),
    [
      'REVOKE "pg_read_all_data" FROM "hm_app_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
      'REVOKE "hm_app_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" FROM "unexpected_member"',
    ],
  );
});

test("runtime role membership revocation rejects unrelated role pairs", () => {
  assert.throws(
    () => buildRuntimeRoleMembershipRevocations(
      "hm_app_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      [{ grantedRole: "pg_read_all_data", memberRole: "another_role" }],
    ),
    /runtime_role_membership_scope_mismatch/,
  );
});

test("runtime role membership revocation safely quotes PostgreSQL role names", () => {
  const runtime = "hm_app_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  assert.deepEqual(
    buildRuntimeRoleMembershipRevocations(runtime, [
      { grantedRole: "legacy-role", memberRole: runtime },
    ]),
    ['REVOKE "legacy-role" FROM "hm_app_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"'],
  );
});
