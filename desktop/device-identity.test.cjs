const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { getDesktopDeviceIdentity } = require("./device-identity.cjs");
describe("HMD stable native identity", () => {
  it("persists UUID and keeps it across restarts", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "hmd-device-"));
    try {
      const first = getDesktopDeviceIdentity(directory);
      const second = getDesktopDeviceIdentity(directory);
      assert.match(first.deviceId, /^[a-f0-9-]{36}$/i);
      assert.deepEqual(first, second);
      assert.ok(first.deviceName.length);
    } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  });
});
