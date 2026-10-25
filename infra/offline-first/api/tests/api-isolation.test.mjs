import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import postgres from "postgres";

const port = 18787 + Math.floor(Math.random() * 1000);
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");
const sql = postgres(databaseUrl, { max: 5 });
const server = spawn(process.execPath, ["infra/offline-first/api/server.mjs"], {
  env: { ...process.env, DATABASE_URL: databaseUrl, HOUSEMIX_API_HOST: "127.0.0.1", HOUSEMIX_API_PORT: String(port) },
  stdio: "inherit",
});
const baseUrl = `http://127.0.0.1:${port}`;
const randomKey = () => crypto.randomBytes(32).toString("base64url");
const digest = (value) => crypto.createHash("sha256").update(value, "utf8").digest();
const auth = (key) => ({ authorization: `Bearer ${key}` });
const post = (path, body, headers = {}) => fetch(baseUrl + path, {
  method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body),
});

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(`API exited early: ${server.exitCode}`);
    try { if ((await fetch(baseUrl + "/health")).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("API did not become healthy");
}
async function issueGrant(tenantId, role, expiresIn = "1 hour") {
  const token = randomKey();
  await sql`
    INSERT INTO device_enrollment_tokens (tenant_id, token_hash, device_role, expires_at, created_by)
    VALUES (${tenantId}, ${digest(token)}, ${role}, now() + ${expiresIn}::interval, 'ci-test')
  `;
  return token;
}

try {
  const suffix = crypto.randomUUID().slice(0, 8);
  const tenantA = `test-alpha-${suffix}`;
  const tenantB = `test-beta-${suffix}`;
  const tenants = await sql`
    INSERT INTO tenants (slug, display_name, status)
    VALUES (${tenantA}, 'CI Alpha', 'active'), (${tenantB}, 'CI Beta', 'active')
    RETURNING id, slug
  `;
  const idA = tenants.find((x) => x.slug === tenantA).id;
  const idB = tenants.find((x) => x.slug === tenantB).id;
  await waitForServer();

  const malformed = await post("/v1/devices/enroll", { enrollment_token: "short", device_key: "short", label: "" });
  assert.equal(malformed.status, 400, "malformed enrollment payload is rejected");
  const unknown = await post("/v1/devices/enroll", { enrollment_token: randomKey(), device_key: randomKey(), label: "Unknown" });
  assert.equal(unknown.status, 401, "unknown enrollment token is rejected");

  const expiredToken = await issueGrant(idA, "workstation", "-1 minute");
  const expired = await post("/v1/devices/enroll", { enrollment_token: expiredToken, device_key: randomKey(), label: "Expired" });
  assert.equal(expired.status, 401, "expired enrollment token is rejected");

  const keyA = randomKey();
  const tokenA = await issueGrant(idA, "primary_server");
  const enrollA = await post("/v1/devices/enroll", {
    enrollment_token: tokenA, device_key: keyA, label: "Alpha primary", device_role: "standby_server", tenant_slug: tenantB,
  });
  const bodyA = await enrollA.json();
  assert.equal(enrollA.status, 201, JSON.stringify(bodyA));
  assert.equal(bodyA.device.tenant_slug, tenantA, "tenant is bound to the grant, not client input");
  assert.equal(bodyA.device.device_role, "primary_server", "role is bound to the grant, not client input");

  const retryA = await post("/v1/devices/enroll", { enrollment_token: tokenA, device_key: keyA, label: "Alpha primary retry" });
  assert.equal(retryA.status, 200, "lost-response retry is idempotent for the same device key");
  assert.equal((await retryA.json()).duplicate, true);
  const reused = await post("/v1/devices/enroll", { enrollment_token: tokenA, device_key: randomKey(), label: "Token thief" });
  assert.equal(reused.status, 409, "consumed token cannot enroll a different device");

  const keyB = randomKey();
  const tokenB = await issueGrant(idB, "workstation");
  const enrollB = await post("/v1/devices/enroll", { enrollment_token: tokenB, device_key: keyB, label: "Beta workstation" });
  const bodyB = await enrollB.json();
  assert.equal(enrollB.status, 201);
  assert.equal(bodyB.device.tenant_slug, tenantB);
  assert.equal(bodyB.device.device_role, "workstation");

  const meA = await fetch(baseUrl + "/v1/me", { headers: auth(keyA) });
  assert.equal((await meA.json()).device.tenant_slug, tenantA);
  const meB = await fetch(baseUrl + "/v1/me", { headers: auth(keyB) });
  assert.equal((await meB.json()).device.tenant_slug, tenantB);
  const badAuth = await fetch(baseUrl + "/v1/me", { headers: auth(randomKey()) });
  assert.equal(badAuth.status, 401);

  const event = {
    aggregate_type: "program", aggregate_id: "program-1", operation: "upsert",
    payload: { name: "Alpha program" }, idempotency_key: "shared-idempotency-key-001",
    tenant_id: bodyB.device.tenant_id,
  };
  const first = await post("/v1/sync/outbox", event, auth(keyA));
  assert.equal(first.status, 202, await first.clone().text());
  const firstBody = await first.json();
  assert.equal(firstBody.event.tenant_id, bodyA.device.tenant_id, "client-supplied tenant_id is ignored");
  const duplicate = await post("/v1/sync/outbox", event, auth(keyA));
  assert.equal(duplicate.status, 200);
  assert.equal((await duplicate.json()).duplicate, true);
  const beta = await post("/v1/sync/outbox", { ...event, payload: { name: "Beta program" } }, auth(keyB));
  assert.equal(beta.status, 202);
  assert.equal((await beta.json()).event.tenant_id, bodyB.device.tenant_id);

  await new Promise((resolve) => setTimeout(resolve, 25));
  const second = await post("/v1/sync/outbox", {
    aggregate_type: "program", aggregate_id: "program-2", operation: "upsert",
    payload: { name: "Alpha page two" }, idempotency_key: "alpha-second-page-event-002",
  }, auth(keyA));
  assert.equal(second.status, 202);
  const page1Response = await fetch(baseUrl + "/v1/sync/changes?limit=1", { headers: auth(keyA) });
  const page1 = await page1Response.json();
  assert.equal(page1Response.status, 200);
  assert.equal(page1.changes.length, 1);
  assert.equal(page1.changes[0].payload.name, "Alpha program");
  assert.equal(page1.has_more, true);
  const page2Response = await fetch(baseUrl + "/v1/sync/changes?limit=1&cursor=" + encodeURIComponent(page1.next_cursor), { headers: auth(keyA) });
  const page2 = await page2Response.json();
  assert.equal(page2Response.status, 200);
  assert.equal(page2.changes.length, 1);
  assert.equal(page2.changes[0].payload.name, "Alpha page two");
  assert.equal(page2.has_more, false);
  const betaChanges = await fetch(baseUrl + "/v1/sync/changes", { headers: auth(keyB) });
  const betaBody = await betaChanges.json();
  assert.equal(betaBody.changes.length, 1, "Beta cannot pull Alpha tenant events");
  assert.equal(betaBody.changes[0].payload.name, "Beta program");

  const scriptPath = "infra/offline-first/api/scripts/manage-devices.mjs";
  const list = spawnSync(process.execPath, [scriptPath, "list", tenantB], {
    env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: "utf8"
  });
  assert.equal(list.status, 0, list.stderr);
  const listed = JSON.parse(list.stdout);
  assert.equal(listed.devices.length, 1, "operator list is scoped to the requested tenant");
  assert.equal(listed.devices[0].id, bodyB.device.id);
  assert.equal("device_key_hash" in listed.devices[0], false, "device credentials are never listed");

  const crossTenantRevoke = spawnSync(process.execPath, [scriptPath, "revoke", tenantA, bodyB.device.id], {
    env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: "utf8"
  });
  assert.notEqual(crossTenantRevoke.status, 0, "operator cannot revoke a device through another tenant slug");
  const stillActive = await fetch(baseUrl + "/v1/me", { headers: auth(keyB) });
  assert.equal(stillActive.status, 200, "cross-tenant revoke attempt leaves device active");

  const revoke = spawnSync(process.execPath, [scriptPath, "revoke", tenantB, bodyB.device.id], {
    env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: "utf8"
  });
  assert.equal(revoke.status, 0, revoke.stderr);
  assert.equal(JSON.parse(revoke.stdout).status, "revoked");
  const revoked = await fetch(baseUrl + "/v1/me", { headers: auth(keyB) });
  assert.equal(revoked.status, 401, "CLI revocation disables device credentials immediately");
  const audit = await sql`
    SELECT event_type FROM local_audit_events
    WHERE tenant_id = ${idB} AND device_id = ${bodyB.device.id} AND event_type = 'device.revoked'
  `;
  assert.equal(audit.length, 1, "device revocation is audited exactly once");
  const revokeAgain = spawnSync(process.execPath, [scriptPath, "revoke", tenantB, bodyB.device.id], {
    env: { ...process.env, DATABASE_URL: databaseUrl }, encoding: "utf8"
  });
  assert.equal(revokeAgain.status, 0, revokeAgain.stderr);
  assert.equal(JSON.parse(revokeAgain.stdout).status, "already_revoked");
  assert.equal((await sql`
    SELECT id FROM local_audit_events
    WHERE tenant_id = ${idB} AND device_id = ${bodyB.device.id} AND event_type = 'device.revoked'
  `).length, 1, "repeated revocation does not duplicate audit events");

  await sql`UPDATE local_devices SET status = 'revoked' WHERE id = ${bodyA.device.id}`;
  const revokedA = await fetch(baseUrl + "/v1/me", { headers: auth(keyA) });
  assert.equal(revokedA.status, 401, "revoked device credentials stop working immediately");
  console.log("PASS: one-time enrollment, expiry, tenant/role binding, safe retry, device listing, tenant-scoped revocation, audit, tenant isolation, idempotency and pagination");
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => server.once("exit", resolve));
  await sql.end();
}
