import { spawn } from "node:child_process";
import { isAbsolute, resolve } from "node:path";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateSecret(secret, tenantId) {
  if (!secret || secret.tenantId !== tenantId ||
      typeof secret.databaseKey !== "string" || !/^hm_[a-f0-9]{32}$/.test(secret.databaseKey) ||
      typeof secret.role !== "string" || !/^hm_app_[a-f0-9]{32}$/.test(secret.role) ||
      typeof secret.password !== "string" || secret.password.length < 48 ||
      !/^[A-Za-z0-9_-]+$/.test(secret.password)) {
    throw new Error("tenant_runtime_secret_invalid");
  }
  return Object.freeze({
    tenantId: secret.tenantId,
    databaseKey: secret.databaseKey,
    role: secret.role,
    password: secret.password,
  });
}

/**
 * Calls the Windows DPAPI VaultHost over private stdin/stdout pipes.
 * The tenant UUID comes only from authenticated server context; no secret is
 * passed in argv, environment variables, logs, or error messages.
 */
export function createDpapiTenantSecretVault({
  executablePath,
  credentialsRoot,
  spawnProcess = spawn,
  timeoutMs = 5000,
  maxOutputBytes = 8192,
}) {
  if (typeof executablePath !== "string" || !isAbsolute(executablePath)) {
    throw new TypeError("An absolute DPAPI vault host executable path is required");
  }
  if (typeof credentialsRoot !== "string" || !isAbsolute(credentialsRoot)) {
    throw new TypeError("An absolute tenant credentials root is required");
  }
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000) {
    throw new RangeError("DPAPI vault timeout must be between 100 and 30000 ms");
  }

  const root = resolve(credentialsRoot);
  return Object.freeze({
    getTenantRuntimeSecret(tenantId) {
      if (typeof tenantId !== "string" || !UUID_PATTERN.test(tenantId)) {
        return Promise.reject(new TypeError("An authenticated tenant UUID is required"));
      }
      const canonicalTenantId = tenantId.toLowerCase();
      return new Promise((resolvePromise, rejectPromise) => {
        let settled = false;
        let stdout = "";
        let outputBytes = 0;
        const child = spawnProcess(executablePath, [], {
          windowsHide: true,
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            ...process.env,
            HOUSEMIX_AUTHENTICATED_TENANT_ID: canonicalTenantId,
            HOUSEMIX_TENANT_CREDENTIALS_ROOT: root,
          },
        });
        const finish = (error, value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (error) rejectPromise(error);
          else resolvePromise(value);
        };
        const timer = setTimeout(() => {
          child.kill();
          finish(new Error("tenant_runtime_vault_timeout"));
        }, timeoutMs);
        child.stdout.setEncoding("utf8");
        child.stdout.on("data", (chunk) => {
          outputBytes += Buffer.byteLength(chunk, "utf8");
          if (outputBytes > maxOutputBytes) {
            child.kill();
            finish(new Error("tenant_runtime_vault_output_too_large"));
            return;
          }
          stdout += chunk;
        });
        child.stderr.on("data", () => {
          // Intentionally discard stderr: never forward provider diagnostics that
          // could accidentally contain protected material.
        });
        child.on("error", () => finish(new Error("tenant_runtime_vault_unavailable")));
        child.on("close", (code) => {
          if (settled) return;
          if (code !== 0) return finish(new Error("tenant_runtime_vault_failed"));
          try {
            const parsed = JSON.parse(stdout);
            if (parsed.secret === null) return finish(null, null);
            finish(null, validateSecret(parsed.secret, canonicalTenantId));
          } catch {
            finish(new Error("tenant_runtime_vault_invalid_response"));
          }
        });
        child.stdin.on("error", () => {});
        child.stdin.end("{}");
      });
    },
  });
}
