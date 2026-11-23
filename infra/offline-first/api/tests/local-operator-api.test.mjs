// Runs only against the disposable CI database. Never point DATABASE_URL to production.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !databaseUrl.includes("housemix_test")) {
  throw new Error("Local operator integration test only accepts disposable housemix_test DB");
}
const db = postgres(databaseUrl, { max: 4 });
const port = 21000 + Math.floor(Math.random() * 1000);
const url = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["infra/offline-first/api/server.mjs"], {
  env: { ...process.env, DATABASE_URL: databaseUrl, HOUSEMIX_API_HOST: "127.0.0.1", HOUSEMIX_API_PORT: String(port) },
  stdio: "inherit",
});
const key = () => crypto.randomBytes(32).toString("base64url");
const digest = (s) => crypto.createHash("sha256").update(s).digest();
const auth = (k, token) => ({
  authorization: `Bearer ${k}`,
  ...(token ? { "x-housemix-operator-session": token } : {}),
});
const post = (path, body, headers) => fetch(url + path, {
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});
async function waitReady() {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error("Local API terminated");
    try { if ((await fetch(url + "/health")).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 250));
  }
  throw new Error("Local API did not become healthy");
}
async function enroll(tenantId, role) {
  const token = key(), deviceKey = key();
  await db`
    INSERT INTO device_enrollment_tokens (tenant_id, token_hash, device_role, expires_at, created_by)
    VALUES (${tenantId}, ${digest(token)}, ${role}, now() + interval '1 hour', 'ci-operator-test')
  `;
  const response = await post("/v1/devices/enroll", { enrollment_token: token, device_key: deviceKey, label: role });
  assert.equal(response.status, 201, await response.text());
  return deviceKey;
}
try {
  const suffix = crypto.randomUUID().slice(0, 8);
  const slugs = [`operator-a-${suffix}`, `operator-b-${suffix}`];
  const tenants = await db`
    INSERT INTO tenants (slug, display_name, status)
    VALUES (${slugs[0]}, 'Operator Test A', 'active'),
           (${slugs[1]}, 'Operator Test B', 'active')
    RETURNING id, slug
  `;
  await waitReady();
  const idA = tenants.find(t => t.slug === slugs[0]).id;
  const idB = tenants.find(t => t.slug === slugs[1]).id;
  const primaryA = await enroll(idA, "primary_server");
  const workstationA = await enroll(idA, "workstation");
  const workstationB = await enroll(idB, "workstation");

  const creds = { email: "Operator@Test.Example", password: "StrongPassword!2026" };
  const forbidden = await post("/v1/operators/provision", {
    subject: "operator-one", ...creds, role: "operator",
  }, auth(workstationA));
  assert.equal(forbidden.status, 403, "only primary server may provision local operators");

  const created = await post("/v1/operators/provision", {
    subject: "operator-one", ...creds, role: "operator",
  }, auth(primaryA));
  assert.equal(created.status, 201, await created.text());
  const again = await post("/v1/operators/provision", {
    subject: "operator-one", ...creds, role: "operator",
  }, auth(primaryA));
  assert.equal(again.status, 409, "provisioning is immutable by default");

  const bad = await post("/v1/operators/login", { ...creds, password: "Wrong!" }, auth(workstationA));
  assert.equal(bad.status, 401);
  const crossTenant = await post("/v1/operators/login", creds, auth(workstationB));
  assert.equal(crossTenant.status, 401, "cannot authenticate across tenants");

  const login = await post("/v1/operators/login", creds, auth(workstationA));
  const body = await login.json();
  assert.equal(login.status, 200, JSON.stringify(body));
  assert.equal(body.local, true);
  assert.equal(body.user.email, "operator@test.example");
  assert.equal(body.user.role, "operator");
  assert.equal(Object.hasOwn(body.user, "password_verifier"), false);

  const ownSession = await fetch(url + "/v1/operators/session", {
    headers: auth(workstationA, body.token),
  });
  assert.equal(ownSession.status, 200);
  const foreignSession = await fetch(url + "/v1/operators/session", {
    headers: auth(workstationB, body.token),
  });
  assert.equal(foreignSession.status, 401, "offline session is tied to device and tenant");

  const logout = await post("/v1/operators/logout", {}, auth(workstationA, body.token));
  assert.equal(logout.status, 200);
  const afterLogout = await fetch(url + "/v1/operators/session", {
    headers: auth(workstationA, body.token),
  });
  assert.equal(afterLogout.status, 401);

  const relogin = await post("/v1/operators/login", creds, auth(workstationA));
  assert.equal(relogin.status, 200);
  const newer = await relogin.json();
  await db`
    UPDATE local_operator_accounts SET status = 'disabled'
    WHERE tenant_id = ${idA} AND user_subject = 'operator-one'
  `;
  const revoked = await fetch(url + "/v1/operators/session", {
    headers: auth(workstationA, newer.token),
  });
  assert.equal(revoked.status, 401, "local revocation takes effect without cloud access");
  console.log("PASS: offline login, session binding, isolation and revocation");
} finally {
  server.kill();
  await db.end({ timeout: 5 });
}
