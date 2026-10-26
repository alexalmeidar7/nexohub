const { EventEmitter } = require("node:events");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { startLocalApiHost } = require("./local-api-host.cjs");

function fakeChild() {
  const child = new EventEmitter();
  child.stdin = { write: () => true };
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

test("does not start unless explicitly enabled", async () => {
  let spawned = false;
  const host = startLocalApiHost({
    executablePath: path.resolve("host.exe"), env: {},
    spawnProcess: () => { spawned = true; }
  });
  assert.equal(host.configured, false);
  assert.equal(await host.ready, false);
  assert.equal(spawned, false);
});

test("requires an absolute host path", () => {
  assert.throws(() => startLocalApiHost({
    executablePath: "host.exe", env: { HOUSEMIX_LOCAL_API_ENABLED: "true" }
  }), /absolute/);
});

test("resolves bundled Node and API paths from the runtime root", async () => {
  const child = fakeChild();
  let options;
  const executablePath = path.resolve("resources/runtime/local-api-host/HouseMix.OfflineFirst.Host.exe");
  const host = startLocalApiHost({
    executablePath, env: { HOUSEMIX_LOCAL_API_ENABLED: "true" },
    spawnProcess: (_file, _args, value) => { options = value; return child; }
  });
  const root = path.resolve("resources/runtime");
  assert.equal(options.env.HOUSEMIX_LOCAL_API_NODE_PATH, path.join(root, "node", "node.exe"));
  assert.equal(options.env.HOUSEMIX_LOCAL_API_SCRIPT_PATH, path.join(root, "api", "server.mjs"));
  assert.equal(options.env.HOUSEMIX_LOCAL_API_WORKING_DIRECTORY, path.join(root, "api"));
  child.stdout.emit("data", Buffer.from("HOUSEMIX_LOCAL_API_READY\n"));
  assert.equal(await host.ready, true);
  await host.stop();
});

test("waits for readiness and stops the supervised process", async () => {
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
