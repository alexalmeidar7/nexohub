import { withAuthenticatedTenantRuntime } from "./tenant-runtime-http.mjs";

function encodeCursor(row) {
  return Buffer.from(JSON.stringify({
    version: 4,
    created_at_us: row.created_at_cursor_us,
    id: row.id,
  })).toString("base64url");
}
function decodeCursor(value) {
  if (!value) return null;
  if (typeof value !== "string" || value.length > 512) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || parsed.version !== 4 ||
        typeof parsed.created_at_us !== "string" ||
        !/^\d{1,20}$/.test(parsed.created_at_us) ||
        typeof parsed.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.id)) return undefined;
    return { created_at_us: parsed.created_at_us, id: parsed.id };
  } catch { return undefined; }
}

export function mountTenantSyncRoutes(app, { authenticateDevice, tenantRuntime }) {
  if (!app || typeof app.post !== "function" || typeof app.get !== "function" ||
      typeof authenticateDevice !== "function") {
    throw new TypeError("An Express app and device authentication middleware are required");
  }
  const run = (handler) => {
    if (!tenantRuntime) return (_req, res) => res.status(503).json({ error: "tenant_runtime_not_configured" });
    return withAuthenticatedTenantRuntime({ tenantRuntime, handler });
  };

  app.post("/v1/sync/outbox", authenticateDevice, run(async (req, res) => {
    const { aggregate_type, aggregate_id, operation, payload, idempotency_key } = req.body || {};
    if (typeof aggregate_type !== "string" || aggregate_type.trim().length < 1 || aggregate_type.length > 80 ||
        typeof aggregate_id !== "string" || aggregate_id.trim().length < 1 || aggregate_id.length > 160 ||
        !["upsert", "delete"].includes(operation) ||
        typeof idempotency_key !== "string" || idempotency_key.length < 8 || idempotency_key.length > 160 ||
        (operation === "upsert" && (!payload || typeof payload !== "object" || Array.isArray(payload))) ||
        (operation === "delete" && payload !== undefined && payload !== null)) {
      return res.status(400).json({ error: "invalid_outbox_event" });
    }
    try {
      const db = req.tenantRuntime.db;
      const rows = await db`
        INSERT INTO housemix.sync_outbox
          (origin_device_id, aggregate_type, aggregate_id, operation, payload, idempotency_key)
        VALUES
          (${req.device.id}, ${aggregate_type.trim()}, ${aggregate_id.trim()},
           ${operation}, ${operation === "upsert" ? db.json(payload) : null}, ${idempotency_key})
        ON CONFLICT (idempotency_key) DO NOTHING
        RETURNING id, aggregate_type, aggregate_id, operation, created_at
      `;
      if (!rows.length) {
        const existing = await db`
          SELECT id, aggregate_type, aggregate_id, operation, created_at
          FROM housemix.sync_outbox WHERE idempotency_key = ${idempotency_key}
        `;
        if (!existing.length) return res.status(409).json({ error: "idempotency_conflict" });
        return res.status(200).json({ accepted: true, duplicate: true, event: existing[0] });
      }
      return res.status(202).json({ accepted: true, duplicate: false, event: rows[0] });
    } catch {
      return res.status(500).json({ error: "outbox_write_failed" });
    }
  }));

  app.get("/v1/sync/changes", authenticateDevice, run(async (req, res) => {
    if (req.query.cursor !== undefined) return res.status(400).json({ error: "server_managed_checkpoint_required" });
    const limit = req.query.limit === undefined ? 100 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 250) {
      return res.status(400).json({ error: "invalid_page_limit" });
    }
    try {
      const db = req.tenantRuntime.db;
      const result = await db.begin(async (tx) => {
        await tx`
          INSERT INTO housemix.sync_checkpoints (device_id, stream_name)
          VALUES (${req.device.id}, 'outbox')
          ON CONFLICT (device_id, stream_name) DO NOTHING
        `;
        const checkpoints = await tx`
          SELECT cursor_value, issued_cursor_value
          FROM housemix.sync_checkpoints
          WHERE device_id = ${req.device.id} AND stream_name = 'outbox'
          FOR UPDATE
        `;
        const checkpoint = checkpoints[0];
        const committed = decodeCursor(checkpoint.cursor_value);
        if (checkpoint.cursor_value && !committed) throw new Error("stored_sync_checkpoint_invalid");
        const rows = committed
          ? await tx`
              SELECT id, origin_device_id, aggregate_type, aggregate_id, operation, payload, created_at,
                     (extract(epoch FROM created_at) * 1000000)::bigint::text AS created_at_cursor_us
              FROM housemix.sync_outbox
              WHERE ((extract(epoch FROM created_at) * 1000000)::bigint, id) >
                    (${committed.created_at_us}::bigint, ${committed.id}::uuid)
              ORDER BY created_at ASC, id ASC LIMIT ${limit + 1}
            `
          : await tx`
              SELECT id, origin_device_id, aggregate_type, aggregate_id, operation, payload, created_at,
                     (extract(epoch FROM created_at) * 1000000)::bigint::text AS created_at_cursor_us
              FROM housemix.sync_outbox
              ORDER BY created_at ASC, id ASC LIMIT ${limit + 1}
            `;
        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const last = page[page.length - 1];
        let ackCursor = checkpoint.issued_cursor_value;
        if (ackCursor && !decodeCursor(ackCursor)) throw new Error("stored_issued_sync_checkpoint_invalid");
        if (!ackCursor && last) {
          ackCursor = encodeCursor(last);
          await tx`
            UPDATE housemix.sync_checkpoints
            SET issued_cursor_value = ${ackCursor}, updated_at = now()
            WHERE device_id = ${req.device.id} AND stream_name = 'outbox'
          `;
        }
        return { changes: page, has_more: hasMore, ack_cursor: ackCursor || null };
      });
      return res.json(result);
    } catch {
      return res.status(500).json({ error: "sync_pull_failed" });
    }
  }));

  app.post("/v1/sync/ack", authenticateDevice, run(async (req, res) => {
    const cursor = req.body?.ack_cursor;
    if (typeof cursor !== "string" || !decodeCursor(cursor)) {
      return res.status(400).json({ error: "invalid_sync_ack" });
    }
    try {
      const db = req.tenantRuntime.db;
      const updated = await db`
        UPDATE housemix.sync_checkpoints
        SET cursor_value = issued_cursor_value, issued_cursor_value = NULL, updated_at = now()
        WHERE device_id = ${req.device.id} AND stream_name = 'outbox'
          AND issued_cursor_value = ${cursor}
        RETURNING cursor_value
      `;
      if (!updated.length) return res.status(409).json({ error: "sync_ack_not_issued" });
      return res.json({ acknowledged: true });
    } catch {
      return res.status(500).json({ error: "sync_ack_failed" });
    }
  }));
  app.post("/v1/sync/inbox", authenticateDevice, run(async (req, res) => {
    const body = req.body || {};
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const { mutation_id, source, aggregate_type, aggregate_id, operation, payload, base_version, schema_version } = body;
    if (typeof mutation_id !== "string" || !uuid.test(mutation_id) ||
        typeof source !== "string" || source.trim().length < 1 || source.length > 40 ||
        typeof aggregate_type !== "string" || aggregate_type.trim().length < 1 || aggregate_type.length > 80 ||
        typeof aggregate_id !== "string" || aggregate_id.trim().length < 1 || aggregate_id.length > 160 ||
        !["upsert", "delete"].includes(operation) ||
        !Number.isInteger(schema_version) || schema_version < 1 ||
        (base_version !== undefined && base_version !== null &&
          (!Number.isSafeInteger(base_version) || base_version < 0)) ||
        (operation === "upsert" && (!payload || typeof payload !== "object" || Array.isArray(payload))) ||
        (operation === "delete" && payload !== undefined && payload !== null)) {
      return res.status(400).json({ error: "invalid_inbox_mutation" });
    }
    try {
      const db = req.tenantRuntime.db;
      const inserted = await db`
        INSERT INTO housemix.sync_inbox
          (mutation_id, received_by_device_id, source, aggregate_type, aggregate_id,
           operation, payload, base_version, schema_version)
        VALUES
          (${mutation_id}::uuid, ${req.device.id}, ${source.trim()}, ${aggregate_type.trim()},
           ${aggregate_id.trim()}, ${operation}, ${operation === "upsert" ? db.json(payload) : null},
           ${base_version ?? null}, ${schema_version})
        ON CONFLICT (mutation_id) DO NOTHING
        RETURNING id, mutation_id, status, received_at
      `;
      if (inserted.length) return res.status(202).json({ accepted: true, duplicate: false, mutation: inserted[0] });
      const existing = await db`
        SELECT id, mutation_id, status, received_at,
               received_by_device_id = ${req.device.id} AS same_device,
               source = ${source.trim()} AS same_source,
               aggregate_type = ${aggregate_type.trim()} AS same_type,
               aggregate_id = ${aggregate_id.trim()} AS same_aggregate,
               operation = ${operation} AS same_operation,
               payload IS NOT DISTINCT FROM ${operation === "upsert" ? db.json(payload) : null} AS same_payload,
               base_version IS NOT DISTINCT FROM ${base_version ?? null} AS same_base_version,
               schema_version = ${schema_version} AS same_schema_version
        FROM housemix.sync_inbox WHERE mutation_id = ${mutation_id}::uuid
      `;
      if (!existing.length) return res.status(409).json({ error: "inbox_mutation_conflict" });
      const row = existing[0];
      const same = ["same_device", "same_source", "same_type", "same_aggregate", "same_operation",
        "same_payload", "same_base_version", "same_schema_version"].every((key) => row[key] === true);
      if (!same) return res.status(409).json({ error: "mutation_id_reused_with_different_content" });
      return res.status(200).json({
        accepted: true, duplicate: true,
        mutation: { id: row.id, mutation_id: row.mutation_id, status: row.status, received_at: row.received_at },
      });
    } catch {
      return res.status(500).json({ error: "inbox_write_failed" });
    }
  }));

}
