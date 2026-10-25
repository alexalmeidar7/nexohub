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
const auth = (key) => ({ authorization: `Bearer ${key}` });
const post = (path, body, headers = {}) => fetch(baseUrl + path, {
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(`API exited early: ${server.exitCode}`);
    try {
      const response = await fetch(baseUrl + "/health");
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

  const rejectedEnroll = await post("/v1/devices/enroll",
    { tenant_slug: tenantA, device_key: deviceKey(), label: "Rejected", device_role: "primary_server" },
    { "x-housemix-enrollment-secret": "wrong-enrollment-secret" });
  assert.equal(rejectedEnroll.status, 401, "enrollment requires the bootstrap secret");

  const malformedEnroll = await post("/v1/devices/enroll",
    { tenant_slug: tenantA, device_key: "short", label: "Invalid", device_role: "primary_server" },
    { "x-housemix-enrollment-secret": secret });
  assert.equal(malformedEnroll.status, 400, "malformed device enrollment is rejected");

  const keyA = deviceKey();
  const keyB = deviceKey();
  const enrollA = await post("/v1/devices/enroll",
    { tenant_slug: tenantA, device_key: keyA, label: "Alpha primary", device_role: "primary_server" },
    { "x-housemix-enrollment-secret": secret });
  const enrollABody = await enrollA.json();
  assert.equal(enrollA.status, 201, `Alpha device enrolls: ${JSON.stringify(enrollABody)}`);

  const enrollB = await post("/v1/devices/enroll",
    { tenant_slug: tenantB, device_key: keyB, label: "Beta primary", device_role: "primary_server" },
    { "x-housemix-enrollment-secret": secret });
  const enrollBBody = await enrollB.json();
  assert.equal(enrollB.status, 201, `Beta device enrolls: ${JSON.stringify(enrollBBody)}`);

  const meA = await fetch(baseUrl + "/v1/me", { headers: auth(keyA) });
  const bodyA = await meA.json();
  assert.equal(meA.status, 200);
  assert.equal(bodyA.device.tenant_slug, tenantA, "Alpha key resolves only to Alpha");

  const meB = await fetch(baseUrl + "/v1/me", { headers: auth(keyB) });
  const bodyB = await meB.json();
  assert.equal(meB.status, 200);
  assert.equal(bodyB.device.tenant_slug, tenantB, "Beta key resolves only to Beta");

  const badAuth = await fetch(baseUrl + "/v1/me", { headers: auth("x".repeat(40)) });
  assert.equal(badAuth.status, 401, "unknown device key is rejected");

  const event = {
    aggregate_type: "program",
    aggregate_id: "program-1",
    operation: "upsert",
    payload: { name: "Alpha program" },
    idempotency_key: "shared-idempotency-key-001",
    tenant_id: bodyB.device.tenant_id,
  };
  const first = await post("/v1/sync/outbox", event, auth(keyA));
  assert.equal(first.status, 202, `Alpha event accepted: ${await first.clone().text()}`);
  const firstBody = await first.json();
  assert.equal(firstBody.event.tenant_id, bodyA.device.tenant_id, "client-supplied tenant_id is ignored");

  const duplicate = await post("/v1/sync/outbox", event, auth(keyA));
  assert.equal(duplicate.status, 200, "same tenant idempotency key is deduplicated");
  assert.equal((await duplicate.json()).duplicate, true);

  const betaEvent = { ...event, payload: { name: "Beta program" } };
  const beta = await post("/v1/sync/outbox", betaEvent, auth(keyB));
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

  // Add a second Alpha event so limit=1 exercises a real next page.
  const alphaSecond = await post("/v1/sync/outbox", {
    aggregate_type: "program",
    aggregate_id: "program-2",
    operation: "upsert",
    payload: { name: "Alpha program page two" },
    idempotency_key: "alpha-second-page-event-002",
  }, auth(keyA));
  assert.equal(alphaSecond.status, 202, "second Alpha event is accepted for pagination");

  const alphaChanges = await fetch(baseUrl + "/v1/sync/changes?limit=1", { headers: auth(keyA) });
  assert.equal(alphaChanges.status, 200, "authenticated device can pull its tenant changes");
  const alphaPage = await alphaChanges.json();
  assert.equal(alphaPage.changes.length, 1, "pull endpoint enforces the requested page size");
  assert.equal(alphaPage.changes[0].payload.name, "Alpha program");
  assert.equal(alphaPage.has_more, true, "pull endpoint indicates another page exists");
  assert.ok(alphaPage.next_cursor, "pull endpoint returns a continuation cursor");

  const alphaNext = await fetch(baseUrl + "/v1/sync/changes?limit=1&cursor=" + encodeURIComponent(alphaPage.next_cursor), { headers: auth(keyA) });
  const alphaNextBody = await alphaNext.json();
  assert.equal(alphaNext.status, 200);
  assert.equal(alphaNextBody.changes.length, 1);
  assert.equal(alphaNextBody.changes[0].payload.name, "Alpha program page two");

  const betaChanges = await fetch(baseUrl + "/v1/sync/changes", { headers: auth(keyB) });
  const betaBody = await betaChanges.json();
  assert.equal(betaChanges.status, 200);
  assert.equal(betaBody.changes.length, 1, "Beta cannot pull Alpha tenant events");
  assert.equal(betaBody.changes[0].payload.name, "Beta program");

  const invalidCursor = await fetch(baseUrl + "/v1/sync/changes?cursor=not-a-cursor", { headers: auth(keyA) });
  assert.equal(invalidCursor.status, 400, "malformed sync cursors are rejected");

  const invalidLimit = await fetch(baseUrl + "/v1/sync/changes?limit=999", { headers: auth(keyA) });
  assert.equal(invalidLimit.status, 400, "oversized sync pages are rejected");

  await sql`UPDATE local_devices SET status = 'revoked' WHERE tenant_id = ${bodyA.device.tenant_id} AND id = ${bodyA.device.id}`;
  const revoked = await fetch(baseUrl + "/v1/me", { headers: auth(keyA) });
  assert.equal(revoked.status, 401, "revoked device credentials stop working immediately");

  console.log("PASS: enrollment authorization, payload validation, device revocation, tenant isolation, and idempotency");
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => server.once("exit", resolve));
  await sql.end();
}
