import test from "node:test";
import assert from "node:assert/strict";
import {
  createDatabaseKey,
  validateDatabaseKey,
  assertProvisioningMayActivate,
} from "../database-provisioning.mjs";

test("same tenant always resolves to the same isolated database key", () => {
  const a = createDatabaseKey("00000000-0000-4000-8000-000000000001");
  const b = createDatabaseKey("00000000-0000-4000-8000-000000000001");
  const other = createDatabaseKey("00000000-0000-4000-8000-000000000002");
  assert.equal(a, b);
  assert.notEqual(a, other);
  assert.match(a, /^hm_[a-f0-9]{32}$/);
});

test("rejects tenant values that are not UUIDs", () => {
  assert.throws(() => createDatabaseKey("radio-alpha"), /tenant UUID/);
  assert.throws(() => createDatabaseKey("../../postgres"), /tenant UUID/);
});

test("database key validator rejects client-controlled identifiers", () => {
  assert.equal(validateDatabaseKey("hm_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"),
    "hm_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
  assert.throws(() => validateDatabaseKey("radio_alpha"));
  assert.throws(() => validateDatabaseKey("hm_aaaaaaaa;DROP DATABASE postgres"));
});

test("activation requires an existing database and verified migration version", () => {
  assert.equal(assertProvisioningMayActivate({
    databaseExists: true, migrationVersion: 1, verifiedVersion: 1
  }), true);
  assert.throws(() => assertProvisioningMayActivate({
    databaseExists: false, migrationVersion: 1, verifiedVersion: 1
  }));
  assert.throws(() => assertProvisioningMayActivate({
    databaseExists: true, migrationVersion: 2, verifiedVersion: 1
  }));
  assert.throws(() => assertProvisioningMayActivate({
    databaseExists: true, migrationVersion: 0, verifiedVersion: 0
  }));
});
