const { spawn } = require("node:child_process");
const path = require("node:path");

function startLocalApiHost({
  executablePath,
  env = process.env,
  spawnProcess = spawn,
  startupTimeoutMs = 30000
}) {
  if (process.platform !== "win32") {
    return { configured: false, ready: Promise.resolve(false), stop: async () => {} };
  }

  if (env.HOUSEMIX_LOCAL_API_ENABLED !== "true") {
    return { configured: false, ready: Promise.resolve(false), stop: async () => {} };
  }

  if (!executablePath || !path.isAbsolute(executablePath)) {
    throw new Error("The local API host executable path must be absolute.");
  }

  const child = spawnProcess(executablePath, [], {
    windowsHide: true,
    shell: false,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...env }
  });

  let settled = false;
  let stdoutBuffer = "";
  let timeout;
  let resolveReady;
  let rejectReady;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });

  const fail = (error) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout);
    rejectReady(error);
  };

  timeout = setTimeout(() => fail(new Error("Local API host startup timed out.")), startupTimeoutMs);

  child.once("error", () => fail(new Error("Local API host process could not be started.")));
  child.once("exit", (code) => {
    if (!settled) fail(new Error(`Local API host exited before readiness (code ${code ?? "unknown"}).`));
  });

  child.stdout?.on("data", (chunk) => {
    stdoutBuffer += chunk.toString("utf8");
    if (stdoutBuffer.length > 4096) stdoutBuffer = stdoutBuffer.slice(-4096);
    if (stdoutBuffer.split(/\r?\n/).includes("HOUSEMIX_LOCAL_API_READY") && !settled) {
      settled = true;
      clearTimeout(timeout);
      resolveReady(true);
    }
  });

  // Consume stderr without forwarding it to logs; it may contain local paths or diagnostics.
  child.stderr?.on("data", () => {});

  return {
    configured: true,
    ready,
    stop: async () => {
      clearTimeout(timeout);
      if (child.exitCode !== null || child.signalCode !== null) return;
      await new Promise((resolve) => {
        const forceTimer = setTimeout(() => {
          try { child.kill(); } catch {}
          resolve();
        }, 5000);
        child.once("exit", () => {
          clearTimeout(forceTimer);
          resolve();
        });
        try { child.kill(); } catch {
          clearTimeout(forceTimer);
          resolve();
        }
      });
    }
  };
}

module.exports = { startLocalApiHost };
