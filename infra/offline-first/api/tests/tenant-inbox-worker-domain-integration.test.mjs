import test from "node:test";
import assert from "node:assert/strict";
import { createTenantInboxWorker } from "../tenant-inbox-worker.mjs";

const inboxItem = {
  id: "00000000-0000-4000-8000-000000000001",
  mutation_id: "00000000-0000-4000-8000-000000000002",
  lease_token: "00000000-0000-4000-8000-000000000003",
  aggregate_type: "programa",
  aggregate_id: "00000000-0000-4000-8000-000000000004",
  operation: "upsert", payload: { nome: "Nexo" }, base_version: 0, schema_version: 1,
};

function fakeDb(items = [inboxItem]) {
  const calls = [];
  const db = async (strings, ...values) => {
    const sql = strings.join(" ");
    calls.push({ sql, values });
    if (sql.includes("SET status =") && sql.includes("RETURNING id, status")) return [{ id: inboxItem.id, status: values[1] }];
    if (sql.includes("SET status = 'pending'")) return [{ id: inboxItem.id, status: "pending" }];
    return [];
  };
  db.begin = async (callback) => callback(async (strings, ...values) => {
    const sql = strings.join(" ");
    calls.push({ sql, values });
    if (sql.includes("WITH candidates")) return items;
    return [];
  });
  return { db, calls };
}

test("worker processes leased items through the domain applier", async () => {
  const { db } = fakeDb();
  const applied = [];
  const worker = createTenantInboxWorker(db, {
    domainApplier: { async apply(item) { applied.push(item.id); return { status: "applied" }; } },
  });
  const summary = await worker.processBatch();
  assert.deepEqual(applied, [inboxItem.id]);
  assert.deepEqual(summary, { claimed: 1, applied: 1, conflicts: 0, rejected: 0, retried: 0, stale: 0 });
});

test("worker records rejected mutations using the current lease", async () => {
  const { db, calls } = fakeDb();
  const worker = createTenantInboxWorker(db, {
    domainApplier: { async apply() { return { status: "rejected", reason: "invalid_payload" }; } },
  });
  const summary = await worker.processBatch();
  assert.equal(summary.rejected, 1);
  assert.ok(calls.some(({ sql }) => sql.includes("RETURNING id, status")));
});

test("worker retries transient applier failures without exposing exception text", async () => {
  const { db, calls } = fakeDb();
  const worker = createTenantInboxWorker(db, {
    domainApplier: { async apply() { throw new Error("sensitive connection string"); } },
  });
  const summary = await worker.processBatch(10, { retryDelaySeconds: 15 });
  assert.equal(summary.retried, 1);
  const retry = calls.find(({ sql }) => sql.includes("SET status = 'pending'"));
  assert.ok(retry);
  assert.ok(retry.values.includes("domain_apply_failed"));
  assert.ok(!retry.values.includes("sensitive connection string"));
});

test("worker counts expired leases as stale and does not retry them", async () => {
  const { db, calls } = fakeDb();
  const worker = createTenantInboxWorker(db, {
    domainApplier: { async apply() { return { status: "stale_lease" }; } },
  });
  const summary = await worker.processBatch();
  assert.equal(summary.stale, 1);
  assert.equal(calls.some(({ sql }) => sql.includes("SET status = 'pending'")), false);
});

test("worker refuses processing without a domain applier", async () => {
  const { db } = fakeDb();
  const worker = createTenantInboxWorker(db);
  await assert.rejects(() => worker.processBatch(), /domain_applier_not_configured/);
});
