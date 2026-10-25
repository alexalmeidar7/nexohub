import crypto from "node:crypto";
import express from "express";
import postgres from "postgres";

const required = ["DATABASE_URL", "HOUSEMIX_ENROLLMENT_SECRET"];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}
if (process.env.HOUSEMIX_ENROLLMENT_SECRET.length < 32) {
  throw new Error("HOUSEMIX_ENROLLMENT_SECRET must contain at least 32 characters");
}

const host = process.env.HOUSEMIX_API_HOST || "127.0.0.1";
if (host !== "127.0.0.1" && process.env.HOUSEMIX_ALLOW_LAN !== "true") {
  throw new Error("LAN binding is disabled until HOUSEMIX_ALLOW_LAN=true after security review");
}
const port = Number(process.env.HOUSEMIX_API_PORT || 8787);
const db = postgres(process.env.DATABASE_URL, { max: 10, idle_timeout: 20, connect_timeout: 5 });
const app = express();
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb", strict: true }));

const hash = (value) => crypto.createHash("sha256").update(value, "utf8").digest();
const constantTimeEqual = (a, b) => {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

app.get("/health", async (_req, res) => {
  try {
    await db`SELECT 1`;
    res.json({ ok: true, service: "housemix-local-api" });
  } catch {
    res.status(503).json({ ok: false, error: "database_unavailable" });
  }
});

app.post("/v1/devices/enroll", async (req, res) => {
  const supplied = req.get("x-housemix-enrollment-secret") || "";
  if (!constantTimeEqual(supplied, process.env.HOUSEMIX_ENROLLMENT_SECRET)) {
    return res.status(401).json({ error: "invalid_enrollment_secret" });
  }
  const { tenant_slug, device_key, label, device_role } = req.body || {};
  if (typeof tenant_slug !== "string" || typeof device_key !== "string" ||
      device_key.length < 32 || device_key.length > 256 ||
      typeof label !== "string" || label.trim().length < 1 || label.length > 120 ||
      !["primary_server", "workstation", "standby_server"].includes(device_role)) {
    return res.status(400).json({ error: "invalid_enrollment_payload" });
  }
  try {
    const rows = await db.begin(async (tx) => {
      const tenants = await tx`SELECT id FROM tenants WHERE slug = ${tenant_slug} AND status = 'active' FOR SHARE`;
      if (tenants.length !== 1) return null;
      return tx`
        INSERT INTO local_devices (tenant_id, device_key_hash, label, device_role, status)
        VALUES (${tenants[0].id}, ${hash(device_key)}, ${label.trim()}, ${device_role}, 'active')
        ON CONFLICT (tenant_id, device_key_hash) DO UPDATE
          SET label = EXCLUDED.label, device_role = EXCLUDED.device_role
          WHERE local_devices.status = 'active'
        RETURNING id, tenant_id, label, device_role, status
      `;
    });
    if (!rows) return res.status(404).json({ error: "tenant_not_found_or_inactive" });
    if (rows.length !== 1) return res.status(409).json({ error: "device_key_conflict" });
    return res.status(201).json({ device: rows[0] });
  } catch {
    return res.status(500).json({ error: "enrollment_failed" });
  }
});

async function authenticateDevice(req, res, next) {
  const match = /^Bearer ([A-Za-z0-9_-]{32,256})$/.exec(req.get("authorization") || "");
  if (!match) return res.status(401).json({ error: "device_auth_required" });
  try {
    const rows = await db`
      SELECT d.id, d.tenant_id, d.label, d.device_role, t.slug AS tenant_slug
      FROM local_devices d
      JOIN tenants t ON t.id = d.tenant_id
      WHERE d.device_key_hash = ${hash(match[1])}
        AND d.status = 'active' AND t.status = 'active'
      LIMIT 1
    `;
    if (rows.length !== 1) return res.status(401).json({ error: "invalid_device_credentials" });
    req.device = rows[0];
    next();
  } catch {
    return res.status(503).json({ error: "database_unavailable" });
  }
}

app.get("/v1/me", authenticateDevice, (req, res) => {
  res.json({ device: req.device });
});

app.post("/v1/sync/outbox", authenticateDevice, async (req, res) => {
  const { aggregate_type, aggregate_id, operation, payload, idempotency_key } = req.body || {};
  if (typeof aggregate_type !== "string" || aggregate_type.length < 1 || aggregate_type.length > 80 ||
      typeof aggregate_id !== "string" || aggregate_id.length < 1 || aggregate_id.length > 160 ||
      !["upsert", "delete"].includes(operation) ||
      typeof idempotency_key !== "string" || idempotency_key.length < 8 || idempotency_key.length > 160 ||
      (operation === "upsert" && (!payload || typeof payload !== "object" || Array.isArray(payload))) ||
      (operation === "delete" && payload !== undefined && payload !== null)) {
    return res.status(400).json({ error: "invalid_outbox_event" });
  }
  try {
    const rows = await db`
      INSERT INTO sync_outbox
        (tenant_id, origin_device_id, aggregate_type, aggregate_id, operation, payload, idempotency_key)
      VALUES
        (${req.device.tenant_id}, ${req.device.id}, ${aggregate_type}, ${aggregate_id},
         ${operation}, ${operation === "upsert" ? db.json(payload) : null}, ${idempotency_key})
      ON CONFLICT (tenant_id, idempotency_key) DO NOTHING
      RETURNING id, tenant_id, aggregate_type, aggregate_id, operation, created_at
    `;
    if (rows.length === 0) {
      const existing = await db`
        SELECT id, tenant_id, aggregate_type, aggregate_id, operation, created_at
        FROM sync_outbox
        WHERE tenant_id = ${req.device.tenant_id} AND idempotency_key = ${idempotency_key}
      `;
      return res.status(200).json({ accepted: true, duplicate: true, event: existing[0] });
    }
    return res.status(202).json({ accepted: true, duplicate: false, event: rows[0] });
  } catch {
    return res.status(500).json({ error: "outbox_write_failed" });
  }
});


function encodeCursor(row) {
  return Buffer.from(JSON.stringify({ created_at: row.created_at_cursor, id: row.id })).toString("base64url");
}
function decodeCursor(value) {
  if (!value) return null;
  if (typeof value !== "string" || value.length > 512) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed.created_at !== "string" ||
        Number.isNaN(Date.parse(parsed.created_at)) ||
        typeof parsed.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.id)) return undefined;
    return { created_at: new Date(parsed.created_at), id: parsed.id };
  } catch {
    return undefined;
  }
}

app.get("/v1/sync/changes", authenticateDevice, async (req, res) => {
  const cursor = decodeCursor(req.query.cursor);
  if (cursor === undefined) return res.status(400).json({ error: "invalid_sync_cursor" });
  const rawLimit = req.query.limit === undefined ? 100 : Number(req.query.limit);
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 250) {
    return res.status(400).json({ error: "invalid_page_limit" });
  }
  try {
    const rows = cursor
      ? await db`
          SELECT id, origin_device_id, aggregate_type, aggregate_id, operation, payload, created_at,
                 created_at::text AS created_at_cursor
          FROM sync_outbox
          WHERE tenant_id = ${req.device.tenant_id}
            AND (created_at, id) > (${cursor.created_at}::timestamptz, ${cursor.id}::uuid)
          ORDER BY created_at ASC, id ASC
          LIMIT ${rawLimit + 1}
        `
      : await db`
          SELECT id, origin_device_id, aggregate_type, aggregate_id, operation, payload, created_at,
                 created_at::text AS created_at_cursor
          FROM sync_outbox
          WHERE tenant_id = ${req.device.tenant_id}
          ORDER BY created_at ASC, id ASC
          LIMIT ${rawLimit + 1}
        `;
    const hasMore = rows.length > rawLimit;
    const page = hasMore ? rows.slice(0, rawLimit) : rows;
    const last = page[page.length - 1];
    return res.json({
      changes: page,
      has_more: hasMore,
      next_cursor: hasMore && last ? encodeCursor(last) : null,
    });
  } catch {
    return res.status(500).json({ error: "sync_pull_failed" });
  }
});

app.use((err, _req, res, _next) => {
  if (err instanceof SyntaxError) return res.status(400).json({ error: "invalid_json" });
  return res.status(500).json({ error: "internal_error" });
});

const server = app.listen(port, host, () => {
  console.log(`House Mix local API listening on http://${host}:${port}`);
});
async function shutdown() {
  server.close();
  await db.end({ timeout: 5 });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
