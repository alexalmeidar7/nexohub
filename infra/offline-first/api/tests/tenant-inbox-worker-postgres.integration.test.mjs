import test, { before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { createTenantInboxDomainApplier } from "../tenant-inbox-domain-applier.mjs";
import { createTenantInboxWorker } from "../tenant-inbox-worker.mjs";

const url = process.env.DATABASE_URL;
const sql = url ? postgres(url, { max: 6 }) : null;
const applier = sql ? createTenantInboxDomainApplier(sql) : null;
const deviceId = "00000000-0000-4000-8000-000000000001";

before(async () => {
  if (!sql) return;
  await sql`SELECT 1 FROM housemix.sync_inbox LIMIT 0`;
  await sql`SELECT 1 FROM housemix.programas LIMIT 0`;
});
afterEach(async () => { if (sql) await sql`DELETE FROM housemix.sync_inbox WHERE source = 'worker-integration'`; });
after(async () => { if (sql) await sql.end({ timeout: 5 }); });

function integration(name, fn) {
  test(name, { skip: !sql && "DATABASE_URL is required for PostgreSQL integration tests" }, fn);
}

async function enqueue({ mutationId = randomUUID(), aggregateId = randomUUID(), payload } = {}) {
  const body = payload ?? {
    nome: "Worker PostgreSQL integration",
    horario_inicio: "08:00",
    horario_fim: "09:00",
    dias_semana: ["segunda"],
  };
  const rows = await sql`INSERT INTO housemix.sync_inbox
    (mutation_id, received_by_device_id, source, aggregate_type, aggregate_id,
     operation, payload, base_version, schema_version)
    VALUES (${mutationId}::uuid, ${deviceId}::uuid, 'worker-integration',
      'programa', ${aggregateId}, 'upsert', ${sql.json(body)}, 0, 1)
    RETURNING id, mutation_id`;
  return { ...rows[0], aggregateId, mutationId };
}

integration("PostgreSQL worker claims, applies, and finalizes a mutation atomically", async () => {
  const item = await enqueue();
  const worker = createTenantInboxWorker(sql, { domainApplier: applier });
  const summary = await worker.processBatch();

  assert.deepEqual(summary, {
    claimed: 1, applied: 1, conflicts: 0, rejected: 0, retried: 0, stale: 0,
  });
  const inbox = await sql`SELECT status, attempt_count, lease_token, lease_until
    FROM housemix.sync_inbox WHERE id = ${item.id}::uuid`;
  assert.equal(inbox[0].status, "applied");
  assert.equal(Number(inbox[0].attempt_count), 1);
  assert.equal(inbox[0].lease_token, null);
  assert.equal(inbox[0].lease_until, null);
  const program = await sql`SELECT nome, row_version FROM housemix.programas
    WHERE id = ${item.aggregateId}::uuid`;
  assert.equal(program[0].nome, "Worker PostgreSQL integration");
  assert.equal(Number(program[0].row_version), 1);
});

integration("PostgreSQL enforces mutation id deduplication", async () => {
  const mutationId = randomUUID();
  await enqueue({ mutationId });
  await assert.rejects(() => enqueue({ mutationId }), /unique|duplicate/i);
  const rows = await sql`SELECT count(*)::int AS count FROM housemix.sync_inbox
    WHERE mutation_id = ${mutationId}::uuid`;
  assert.equal(rows[0].count, 1);
});

integration("PostgreSQL worker retries a transient failure and applies on the next lease", async () => {
  const item = await enqueue();
  const failingWorker = createTenantInboxWorker(sql, {
    maxAttempts: 3,
    domainApplier: { async apply() { throw new Error("transient test failure"); } },
  });
  const first = await failingWorker.processBatch(10, { retryDelaySeconds: 5 });
  assert.equal(first.retried, 1);
  let inbox = await sql`SELECT status, attempt_count, last_error_code FROM housemix.sync_inbox
    WHERE id = ${item.id}::uuid`;
  assert.equal(inbox[0].status, "pending");
  assert.equal(Number(inbox[0].attempt_count), 1);
  assert.equal(inbox[0].last_error_code, "domain_apply_failed");

  await sql`UPDATE housemix.sync_inbox SET available_at = now() - interval '1 second'
    WHERE id = ${item.id}::uuid`;
  const successfulWorker = createTenantInboxWorker(sql, { maxAttempts: 3, domainApplier: applier });
  const second = await successfulWorker.processBatch();
  assert.equal(second.applied, 1);
  inbox = await sql`SELECT status, attempt_count FROM housemix.sync_inbox
    WHERE id = ${item.id}::uuid`;
  assert.equal(inbox[0].status, "applied");
  assert.equal(Number(inbox[0].attempt_count), 2);
});

integration("PostgreSQL rejects an expired worker lease and permits a fresh claim", async () => {
  const item = await enqueue();
  const worker = createTenantInboxWorker(sql, { leaseSeconds: 5, domainApplier: applier });
  const [oldClaim] = await worker.claimBatch();
  assert.equal(oldClaim.id, item.id);

  await sql`UPDATE housemix.sync_inbox SET lease_until = now() - interval '1 second'
    WHERE id = ${item.id}::uuid`;
  assert.deepEqual(await applier.apply(oldClaim), { status: "stale_lease" });

  const summary = await worker.processBatch();
  assert.equal(summary.applied, 1);
  const inbox = await sql`SELECT status, attempt_count FROM housemix.sync_inbox
    WHERE id = ${item.id}::uuid`;
  assert.equal(inbox[0].status, "applied");
  assert.equal(Number(inbox[0].attempt_count), 2);
  const program = await sql`SELECT row_version FROM housemix.programas
    WHERE id = ${item.aggregateId}::uuid`;
  assert.equal(Number(program[0].row_version), 1);
});
