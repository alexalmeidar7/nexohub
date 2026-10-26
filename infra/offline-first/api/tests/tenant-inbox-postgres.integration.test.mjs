import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import postgres from "postgres";
import { randomUUID } from "node:crypto";
import { createTenantInboxDomainApplier } from "../tenant-inbox-domain-applier.mjs";

const url = process.env.DATABASE_URL;
const sql = url ? postgres(url, { max: 4 }) : null;
const applier = sql ? createTenantInboxDomainApplier(sql) : null;
const deviceId = "00000000-0000-4000-8000-000000000001";

before(async () => {
  if (!sql) return;
  await sql`SELECT 1 FROM housemix.sync_inbox LIMIT 0`;
  await sql`SELECT 1 FROM housemix.programas LIMIT 0`;
  await sql`SELECT 1 FROM housemix.agenda_eventos LIMIT 0`;
});
after(async () => { if (sql) await sql.end({ timeout: 5 }); });

function integration(name, fn) {
  test(name, { skip: !sql && "DATABASE_URL is required for PostgreSQL integration tests" }, fn);
}
async function enqueue({ aggregate_type = "programa", aggregate_id = randomUUID(), operation = "upsert",
  payload, base_version = 0, schema_version = 1 } = {}) {
  const id = randomUUID();
  const mutation_id = randomUUID();
  const lease_token = randomUUID();
  const body = payload === undefined
    ? (aggregate_type === "programa"
      ? { nome: "Programa integração", horario_inicio: "08:00", horario_fim: "09:00", dias_semana: ["segunda"] }
      : { data: "2026-10-26", tipo_evento: "live", descricao: "Evento integração" })
    : payload;
  await sql`INSERT INTO housemix.sync_inbox
    (id, mutation_id, received_by_device_id, source, aggregate_type, aggregate_id,
     operation, payload, base_version, schema_version, status, lease_token, lease_until)
    VALUES (${id}::uuid, ${mutation_id}::uuid, ${deviceId}::uuid, 'integration-test',
      ${aggregate_type}, ${aggregate_id}, ${operation}, ${body === null ? null : sql.json(body)},
      ${base_version}, ${schema_version}, 'processing', ${lease_token}::uuid, now() + interval '2 minutes')`;
  return { id, mutation_id, lease_token, aggregate_type, aggregate_id, operation,
    payload: body, base_version, schema_version };
}

integration("PostgreSQL applies create and versioned update for Programas", async () => {
  const item = await enqueue();
  assert.equal((await applier.apply(item)).status, "applied");
  let rows = await sql`SELECT nome, row_version FROM housemix.programas WHERE id = ${item.aggregate_id}::uuid`;
  assert.equal(rows[0].nome, "Programa integração");
  assert.equal(Number(rows[0].row_version), 1);
  const update = await enqueue({ aggregate_id: item.aggregate_id, base_version: 1,
    payload: { nome: "Programa atualizado" } });
  assert.equal((await applier.apply(update)).status, "applied");
  rows = await sql`SELECT nome, row_version FROM housemix.programas WHERE id = ${item.aggregate_id}::uuid`;
  assert.equal(rows[0].nome, "Programa atualizado");
  assert.equal(Number(rows[0].row_version), 2);
});

integration("PostgreSQL soft-deletes Programas and physically deletes Agenda events", async () => {
  const program = await enqueue();
  assert.equal((await applier.apply(program)).status, "applied");
  const deletion = await enqueue({ aggregate_id: program.aggregate_id, operation: "delete", payload: null, base_version: 1 });
  assert.equal((await applier.apply(deletion)).status, "applied");
  const rows = await sql`SELECT ativo, deleted_at, row_version FROM housemix.programas WHERE id = ${program.aggregate_id}::uuid`;
  assert.equal(rows[0].ativo, false);
  assert.ok(rows[0].deleted_at);
  assert.equal(Number(rows[0].row_version), 2);

  const event = await enqueue({ aggregate_type: "agenda_evento" });
  assert.equal((await applier.apply(event)).status, "applied");
  const eventDelete = await enqueue({ aggregate_type: "agenda_evento", aggregate_id: event.aggregate_id,
    operation: "delete", payload: null, base_version: 1 });
  assert.equal((await applier.apply(eventDelete)).status, "applied");
  assert.equal((await sql`SELECT id FROM housemix.agenda_eventos WHERE id = ${event.aggregate_id}::uuid`).length, 0);
});

integration("PostgreSQL reports optimistic concurrency conflicts and rejects replay", async () => {
  const created = await enqueue();
  assert.equal((await applier.apply(created)).status, "applied");
  const stale = await enqueue({ aggregate_id: created.aggregate_id, base_version: 0,
    payload: { nome: "Versão antiga" } });
  assert.equal((await applier.apply(stale)).status, "conflict");
  assert.equal((await applier.apply(created)).status, "stale_lease");
  const rows = await sql`SELECT nome, row_version FROM housemix.programas WHERE id = ${created.aggregate_id}::uuid`;
  assert.equal(rows[0].nome, "Programa integração");
  assert.equal(Number(rows[0].row_version), 1);
});

integration("PostgreSQL rolls back domain writes when a constraint fails", async () => {
  const invalid = await enqueue({ payload: { nome: "x".repeat(201), horario_inicio: "08:00", horario_fim: "09:00" } });
  await assert.rejects(() => applier.apply(invalid));
  assert.equal((await sql`SELECT id FROM housemix.programas WHERE id = ${invalid.aggregate_id}::uuid`).length, 0);
  const inbox = await sql`SELECT status, lease_token FROM housemix.sync_inbox WHERE id = ${invalid.id}::uuid`;
  assert.equal(inbox[0].status, "processing");
  assert.equal(inbox[0].lease_token, invalid.lease_token);
});

integration("locked inbox row is authoritative over a modified claimed object", async () => {
  const item = await enqueue();
  assert.deepEqual(await applier.apply({ ...item, payload: { nome: "payload adulterado" } }), { status: "stale_lease" });
  assert.equal((await sql`SELECT id FROM housemix.programas WHERE id = ${item.aggregate_id}::uuid`).length, 0);
  const inbox = await sql`SELECT status FROM housemix.sync_inbox WHERE id = ${item.id}::uuid`;
  assert.equal(inbox[0].status, "processing");
});
