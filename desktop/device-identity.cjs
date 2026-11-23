"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
function getDesktopDeviceIdentity(userData) {
  const file = path.join(userData, "device-identity.json");
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    if (UUID.test(parsed.deviceId)) return { deviceId: parsed.deviceId, deviceName: parsed.deviceName };
  } catch (error) { if (error.code !== "ENOENT") throw error; }
  const identity = {
    deviceId: crypto.randomUUID(),
    deviceName: (os.hostname() || "Computador HMD").trim().slice(0, 64) || "Computador HMD",
  };
  fs.mkdirSync(userData, { recursive: true });
  // Exclusive create guards against a second instance replacing an existing ID.
  try {
    fs.writeFileSync(file, JSON.stringify(identity), { encoding: "utf8", flag: "wx", mode: 0o600 });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    return getDesktopDeviceIdentity(userData);
  }
  return identity;
}
module.exports = { getDesktopDeviceIdentity };
