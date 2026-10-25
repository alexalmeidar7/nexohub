import { withAuthenticatedTenantRuntime } from "./tenant-runtime-http.mjs";

function encodeCursor(row) {
  return Buffer.from(JSON.stringify({
    version: 3,
    created_at_us: row.created_at_cursor_us,
    id: row.id,
  })).toString("base64url");
}
function decodeCursor(value) {
  if (!value) return null;
  if (typeof value !== "string" || value.length > 512) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || parsed.version !== 3 ||
        typeof parsed.created_at_us !== "string" ||
        !/^-?\d{1,20}$/.test(parsed.created_at_us) ||
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
    const cursor = decodeCursor(req.query.cursor);
    if (cursor === undefined) return res.status(400).json({ error: "invalid_sync_cursor" });
    const limit = req.query.limit === undefined ? 100 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 250) {
      return res.status(400).json({ error: "invalid_page_limit" });
    }
    try {
      const db = req.tenantRuntime.db;
      const rows = cursor
        ? await db`
            SELECT id, origin_device_id, aggregate_type, aggregate_id, operation, payload, created_at,
                   (extract(epoch FROM created_at) * 1000000)::bigint::text AS created_at_cursor_us
            FROM housemix.sync_outbox
            WHERE ((extract(epoch FROM created_at) * 1000000)::bigint, id) >
                  (${cursor.created_at_us}::bigint, ${cursor.id}::uuid)
            ORDER BY created_at ASC, id ASC LIMIT ${limit + 1}
          `
        : await db`
            SELECT id, origin_device_id, aggregate_type, aggregate_id, operation, payload, created_at,
                   (extract(epoch FROM created_at) * 1000000)::bigint::text AS created_at_cursor_us
            FROM housemix.sync_outbox
            ORDER BY created_at ASC, id ASC LIMIT ${limit + 1}
          `;
      const hasMore = rows.length > limit;
      const page = hasMore ? rows.slice(0, limit) : rows;
      const last = page[page.length - 1];
      return res.json({
        changes: page,
        has_more: hasMore,
        next_cursor: hasMore && last ? encodeCursor(last) : null,
      });
    } catch {
      return res.status(500).json({ error: "sync_pull_failed" });
    }
  }));
}
