const { EventEmitter } = require("node:events");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { startLocalApiHost } = require("./local-api-host.cjs");

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.killed = false;
  child.kill = () => {
    child.killed = true;
    child.exitCode = 0;
    child.emit("exit", 0, null);
    return true;
  };
  return child;
}

test("does not start the local host unless explicitly enabled", async () => {
  let spawned = false;
  const host = startLocalApiHost({
    executablePath: path.resolve("host.exe"),
    env: {},
    spawnProcess: () => { spawned = true; }
  });

  assert.equal(host.configured, false);
  assert.equal(await host.ready, false);
  assert.equal(spawned, false);
});

test("requires an absolute host executable path when enabled", () => {
  assert.throws(() => startLocalApiHost({
    executablePath: "host.exe",
    env: { HOUSEMIX_LOCAL_API_ENABLED: "true" }
  }), /absolute/);
});

test("reports ready only after the host readiness signal", async () => {
  const child = fakeChild();
  const host = startLocalApiHost({
    executablePath: path.resolve("host.exe"),
    env: { HOUSEMIX_LOCAL_API_ENABLED: "true" },
    spawnProcess: () => child
  });

  child.stdout.emit("data", Buffer.from("starting\n"));
  let ready = false;
  host.ready.then(() => { ready = true; });
  await Promise.resolve();
  assert.equal(ready, false);

  child.stdout.emit("data", Buffer.from("HOUSEMIX_LOCAL_API_READY\n"));
  assert.equal(await host.ready, true);
  await host.stop();
  assert.equal(child.killed, true);
});
