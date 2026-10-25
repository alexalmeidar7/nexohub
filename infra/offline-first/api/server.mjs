import crypto from "node:crypto";
import express from "express";
import postgres from "postgres";
import { resolveApiHost } from "./network-config.mjs";

const required = ["DATABASE_URL"];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}

const host = resolveApiHost(process.env);
const port = Number(process.env.HOUSEMIX_API_PORT || 8787);
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
  const { enrollment_token, device_key, label } = req.body || {};
  if (typeof enrollment_token !== "string" || !/^[A-Za-z0-9_-]{40,64}$/.test(enrollment_token) ||
      typeof device_key !== "string" || device_key.length < 32 || device_key.length > 256 ||
      typeof label !== "string" || label.trim().length < 1 || label.length > 120) {
    return res.status(400).json({ error: "invalid_enrollment_payload" });
  }
  try {
    const result = await db.begin(async (tx) => {
      const grants = await tx`
        SELECT e.id, e.tenant_id, e.device_role, e.expires_at, e.consumed_at,
               e.consumed_device_id, e.revoked_at, t.slug AS tenant_slug, t.status AS tenant_status
        FROM device_enrollment_tokens e
        JOIN tenants t ON t.id = e.tenant_id
        WHERE e.token_hash = ${hash(enrollment_token)}
        FOR UPDATE OF e
      `;
      if (grants.length !== 1) return { kind: "invalid" };
      const grant = grants[0];
      if (grant.tenant_status !== "active" || grant.revoked_at ||
          new Date(grant.expires_at).getTime() <= Date.now()) return { kind: "invalid" };
      const keyHash = hash(device_key);
      if (grant.consumed_at) {
        const existing = await tx`
          SELECT id, tenant_id, label, device_role, status
          FROM local_devices
          WHERE tenant_id = ${grant.tenant_id} AND id = ${grant.consumed_device_id}
            AND device_key_hash = ${keyHash} AND status = 'active'
        `;
        return existing.length === 1
          ? { kind: "retry", device: existing[0], tenant_slug: grant.tenant_slug }
          : { kind: "consumed" };
      }
      const inserted = await tx`
        INSERT INTO local_devices (tenant_id, device_key_hash, label, device_role, status)
        VALUES (${grant.tenant_id}, ${keyHash}, ${label.trim()}, ${grant.device_role}, 'active')
        RETURNING id, tenant_id, label, device_role, status
      `;
      await tx`
        UPDATE device_enrollment_tokens
        SET consumed_at = now(), consumed_device_id = ${inserted[0].id}
        WHERE id = ${grant.id}
      `;
      await tx`
        INSERT INTO local_audit_events (tenant_id, device_id, event_type, entity_type, entity_id, details)
        VALUES (${grant.tenant_id}, ${inserted[0].id}, 'device.enrolled', 'device', ${inserted[0].id},
                ${tx.json({ device_role: grant.device_role, label: label.trim() })})
      `;
      return { kind: "created", device: inserted[0], tenant_slug: grant.tenant_slug };
    });
    if (result.kind === "invalid") return res.status(401).json({ error: "invalid_or_expired_enrollment_token" });
    if (result.kind === "consumed") return res.status(409).json({ error: "enrollment_token_already_used" });
    return res.status(result.kind === "retry" ? 200 : 201).json({
      device: { ...result.device, tenant_slug: result.tenant_slug },
      duplicate: result.kind === "retry"
    });
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
  return Buffer.from(JSON.stringify({
    version: 2,
    created_at_us: row.created_at_cursor_us,
    id: row.id,
  })).toString("base64url");
}
function decodeCursor(value) {
  if (!value) return null;
  if (typeof value !== "string" || value.length > 512) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || parsed.version !== 2 ||
        typeof parsed.created_at_us !== "string" ||
        !/^-?\d{1,20}$/.test(parsed.created_at_us) ||
        typeof parsed.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.id)) return undefined;
    return { created_at_us: parsed.created_at_us, id: parsed.id };
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
                 (extract(epoch FROM created_at) * 1000000)::bigint::text AS created_at_cursor_us
          FROM sync_outbox
          WHERE tenant_id = ${req.device.tenant_id}
            AND ((extract(epoch FROM created_at) * 1000000)::bigint, id) >
                (${cursor.created_at_us}::bigint, ${cursor.id}::uuid)
          ORDER BY created_at ASC, id ASC
          LIMIT ${rawLimit + 1}
        `
      : await db`
          SELECT id, origin_device_id, aggregate_type, aggregate_id, operation, payload, created_at,
                 (extract(epoch FROM created_at) * 1000000)::bigint::text AS created_at_cursor_us
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
