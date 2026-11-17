const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { startNdiBridge } = require("./ndi-bridge.cjs");

test("bundled worker runs hidden without pairing and stops without restarting", () => {
  const child = new EventEmitter();
  let killed = false;
  const worker = startNdiBridge({ executablePath: "C:/hmd/bridge.exe", fileExists: () => true,
    spawnProcess(exe, args, options) {
      assert.equal(exe, "C:/hmd/bridge.exe");
      assert.deepEqual(args, ["--ndi-only", "--parent-pid", String(process.pid)]);
      assert.equal(options.windowsHide, true);
      assert.equal(options.stdio, "ignore");
      child.kill = () => { killed = true; child.emit("exit", 0); };
      return child;
    }, setTimer() { assert.fail("shutdown must not restart the worker"); }
  });
  worker.stop();
  assert.equal(killed, true);
});

test("crashes have bounded retries and error+exit does not schedule twice", () => {
  const children = [];
  const timers = [];
  const worker = startNdiBridge({ executablePath: "bridge.exe", fileExists: () => true, log() {},
    spawnProcess() { const child = new EventEmitter(); child.kill = () => {}; children.push(child); return child; },
    setTimer(fn, ms) { timers.push({ fn, ms }); return timers.length; }, clearTimer() {}
  });
  for (let i = 0; i < 4; i++) {
    children[i].emit("error", new Error("port occupied"));
    children[i].emit("exit", 1);
    assert.equal(timers.length, Math.min(i + 1, 3));
    if (i < 3) timers[i].fn();
  }
  assert.deepEqual(timers.map(t => t.ms), [3000, 6000, 9000]);
  worker.stop();
});
