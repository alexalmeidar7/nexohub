import test from "node:test";
import assert from "node:assert/strict";
import { normalizeDomainMutation, createTenantInboxDomainApplier } from "../tenant-inbox-domain-applier.mjs";

const item = {
  id: "00000000-0000-4000-8000-000000000001",
  mutation_id: "00000000-0000-4000-8000-000000000002",
  lease_token: "00000000-0000-4000-8000-000000000003",
  aggregate_type: "programa",
  aggregate_id: "00000000-0000-4000-8000-000000000004",
  operation: "upsert", payload: { nome: "Manhã Nexo" },
  base_version: 0, schema_version: 1,
};

test("domain mutation accepts only whitelisted program fields", () => {
  assert.equal(normalizeDomainMutation(item).valid, true);
  assert.deepEqual(normalizeDomainMutation({ ...item, payload: { nome: "x", tenant_id: "other" } }),
    { valid: false, reason: "payload_field_not_allowed" });
  assert.deepEqual(normalizeDomainMutation({ ...item, payload: { id: item.aggregate_id } }),
    { valid: false, reason: "payload_field_not_allowed" });
});

test("domain mutation rejects unsupported schema, aggregate and mismatched IDs", () => {
  assert.equal(normalizeDomainMutation({ ...item, schema_version: 2 }).reason, "invalid_mutation_envelope");
  assert.equal(normalizeDomainMutation({ ...item, aggregate_type: "arbitrary_table" }).reason, "unsupported_aggregate_type");
  assert.equal(normalizeDomainMutation({ ...item, payload: { nome: "x", id: "00000000-0000-4000-8000-000000000099" } }).reason,
    "payload_field_not_allowed");
});

test("delete requires a base version and null payload", () => {
  assert.equal(normalizeDomainMutation({ ...item, operation: "delete", payload: null, base_version: 0 }).reason,
    "delete_requires_base_version");
  assert.equal(normalizeDomainMutation({ ...item, operation: "delete", payload: { nome: "x" }, base_version: 1 }).reason,
    "delete_payload_must_be_null");
});

test("applier does not open a transaction for an invalid mutation", async () => {
  let began = false;
  const applier = createTenantInboxDomainApplier({ begin: async () => { began = true; } });
  const result = await applier.apply({ ...item, aggregate_type: "untrusted_table" });
  assert.deepEqual(result, { status: "rejected", reason: "unsupported_aggregate_type" });
  assert.equal(began, false);
});

test("applier locks the leased inbox row before applying", async () => {
  let locked = false;
  const db = { begin: async (callback) => {
    const tx = async (strings) => {
      const sql = strings.join(" ");
      if (sql.includes("SELECT id, mutation_id")) {
        locked = true;
        return [{ status: "processing", lease_token: item.lease_token, lease_until: new Date(Date.now() + 60000).toISOString() }];
      }
      if (sql.includes("UPDATE housemix.sync_inbox SET status")) return [{ id: item.id }];
      throw new Error("unexpected query");
    };
    tx.unsafe = async () => [];
    return callback(tx);
  } };
  db.begin = db.begin.bind(db);
  const applier = createTenantInboxDomainApplier(db);
  const result = await applier.apply(item);
  assert.equal(locked, true);
  assert.deepEqual(result, { status: "conflict", aggregate_id: item.aggregate_id });
});
