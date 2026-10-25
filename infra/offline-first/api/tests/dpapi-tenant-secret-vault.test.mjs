import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createDpapiTenantSecretVault } from "../dpapi-tenant-secret-vault.mjs";

const tenantId = "00000000-0000-4000-8000-000000000001";
const secret = {
  tenantId,
  databaseKey: "hm_" + "a".repeat(32),
  role: "hm_app_" + "b".repeat(32),
  password: "C".repeat(64),
};

async function fixture(t, output, exitCode = 0) {
  const dir = await mkdtemp(join(tmpdir(), "housemix-vault-host-"));
  const script = join(dir, "mock-vault.cjs");
  await writeFile(script, `process.stdin.resume(); process.stdin.on("end", () => { process.stdout.write(${JSON.stringify(JSON.stringify(output))}); process.exitCode = ${exitCode}; });`);
  t.after(() => rm(dir, { recursive: true, force: true }));
  const vault = createDpapiTenantSecretVault({
    executablePath: resolve(process.execPath),
    credentialsRoot: dir,
    spawnProcess: (exe, _args, options) => {
      return spawn(exe, [script], options);
    },
  });
  return vault;
}

test("returns only a validated secret for the authenticated tenant", async (t) => {
  const vault = await fixture(t, { secret });
  assert.deepEqual(await vault.getTenantRuntimeSecret(tenantId), secret);
});

test("returns null when the tenant has no provisioned credential", async (t) => {
  const vault = await fixture(t, { secret: null });
  assert.equal(await vault.getTenantRuntimeSecret(tenantId), null);
});

test("rejects invalid tenant identity before starting the helper", () => {
  let spawned = false;
  const vault = createDpapiTenantSecretVault({
    executablePath: resolve(process.execPath),
    credentialsRoot: resolve(tmpdir()),
    spawnProcess: () => { spawned = true; throw new Error("must_not_spawn"); },
  });
  assert.rejects(() => vault.getTenantRuntimeSecret("radio-positiva"), /authenticated tenant UUID/);
  assert.equal(spawned, false);
});

test("rejects a response containing another tenant's secret", async (t) => {
  const vault = await fixture(t, { secret: { ...secret, tenantId: "00000000-0000-4000-8000-000000000002" } });
  await assert.rejects(() => vault.getTenantRuntimeSecret(tenantId), /tenant_runtime_secret_invalid/);
});

test("fails closed on helper errors without exposing stderr", async (t) => {
  const vault = await fixture(t, { secret }, 12);
  await assert.rejects(() => vault.getTenantRuntimeSecret(tenantId), /tenant_runtime_vault_failed/);
});

test("requires absolute executable and credential root paths", () => {
  assert.throws(() => createDpapiTenantSecretVault({ executablePath: "vault.exe", credentialsRoot: resolve(tmpdir()) }));
  assert.throws(() => createDpapiTenantSecretVault({ executablePath: resolve(process.execPath), credentialsRoot: "credentials" }));
});
