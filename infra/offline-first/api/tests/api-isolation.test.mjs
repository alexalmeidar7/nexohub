import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import postgres from "postgres";

const port = 18787 + Math.floor(Math.random() * 1000);
const secret = "ci-enrollment-secret-at-least-32-characters";
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const sql = postgres(databaseUrl, { max: 5 });
const server = spawn(process.execPath, ["infra/offline-first/api/server.mjs"], {
  env: {
    ...process.env,
    DATABASE_URL: databaseUrl,
    HOUSEMIX_ENROLLMENT_SECRET: secret,
    HOUSEMIX_API_HOST: "127.0.0.1",
    HOUSEMIX_API_PORT: String(port),
  },
  stdio: "inherit",
});

const baseUrl = `http://127.0.0.1:${port}`;
const deviceKey = () => crypto.randomBytes(32).toString("base64url");
const request = (path, options = {}) => fetch(baseUrl + path, options);
const json = (body) => ({ "content-type": "application/json", body: JSON.stringify(body) });
const auth = (key) => ({ authorization: `Bearer ${key}` });

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(`API exited early: ${server.exitCode}`);
    try {
      const response = await request("/health");
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("API did not become healthy");
}

try {
  const suffix = crypto.randomUUID().slice(0, 8);
  const tenantA = `test-alpha-${suffix}`;
  const tenantB = `test-beta-${suffix}`;
  await sql`
    INSERT INTO tenants (slug, display_name, status)
    VALUES (${tenantA}, 'CI Alpha', 'active'), (${tenantB}, 'CI Beta', 'active')
  `;

  await waitForServer();

  const keyA = deviceKey();
  const keyB = deviceKey();
  const enrollA = await request("/v1/devices/enroll", {
    method: "POST",
    headers: { ...json({ tenant_slug: tenantA, device_key: keyA, label: "Alpha primary", device_role: "primary_server" }), "x-housemix-enrollment-secret": secret },
  });
  assert.equal(enrollA.status, 201, "Alpha device enrolls");
  const enrollB = await request("/v1/devices/enroll", {
    method: "POST",
    headers: { ...json({ tenant_slug: tenantB, device_key: keyB, label: "Beta primary", device_role: "primary_server" }), "x-housemix-enrollment-secret": secret },
  });
  assert.equal(enrollB.status, 201, "Beta device enrolls");

  const meA = await request("/v1/me", { headers: auth(keyA) });
  const bodyA = await meA.json();
  assert.equal(meA.status, 200);
  assert.equal(bodyA.device.tenant_slug, tenantA, "Alpha key resolves only to Alpha");

  const meB = await request("/v1/me", { headers: auth(keyB) });
  const bodyB = await meB.json();
  assert.equal(meB.status, 200);
  assert.equal(bodyB.device.tenant_slug, tenantB, "Beta key resolves only to Beta");

  const badAuth = await request("/v1/me", { headers: auth("x".repeat(40)) });
  assert.equal(badAuth.status, 401, "unknown device key is rejected");

  const event = {
    aggregate_type: "program",
    aggregate_id: "program-1",
    operation: "upsert",
    payload: { name: "Alpha program" },
    idempotency_key: "shared-idempotency-key-001",
    tenant_id: bodyB.device.tenant_id,
  };
  const first = await request("/v1/sync/outbox", { method: "POST", headers: { ...json(event), ...auth(keyA) } });
  assert.equal(first.status, 202, "authenticated Alpha event is accepted");
  const firstBody = await first.json();
  assert.equal(firstBody.event.tenant_id, bodyA.device.tenant_id, "client-supplied tenant_id is ignored");

  const duplicate = await request("/v1/sync/outbox", { method: "POST", headers: { ...json(event), ...auth(keyA) } });
  assert.equal(duplicate.status, 200, "same tenant idempotency key is deduplicated");
  assert.equal((await duplicate.json()).duplicate, true);

  const betaEvent = { ...event, payload: { name: "Beta program" } };
  const beta = await request("/v1/sync/outbox", { method: "POST", headers: { ...json(betaEvent), ...auth(keyB) } });
  assert.equal(beta.status, 202, "same idempotency key is independent across tenants");
  assert.equal((await beta.json()).event.tenant_id, bodyB.device.tenant_id);

  const count = await sql`
    SELECT tenant_id, count(*)::int AS total
    FROM sync_outbox
    WHERE tenant_id IN (${bodyA.device.tenant_id}, ${bodyB.device.tenant_id})
      AND idempotency_key = 'shared-idempotency-key-001'
    GROUP BY tenant_id
  `;
  assert.equal(count.length, 2, "events remain separated by tenant");
  assert.ok(count.every((row) => row.total === 1), "each tenant has exactly one event");

  console.log("PASS: enrollment, device authentication, tenant scoping, spoofed tenant rejection, and idempotency");
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => server.once("exit", resolve));
  await sql.end();
}
