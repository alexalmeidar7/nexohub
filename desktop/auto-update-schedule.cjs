"use strict";
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_HOUR = 0;
const DEFAULT_MINUTE = 30;
const RESTART_FILE = "vmix-restore-after-update.json";
const RESTORE_VALID_MS = 72 * 60 * 60 * 1000;

function nextDailyInstallAt(now = new Date(), hour = DEFAULT_HOUR, minute = DEFAULT_MINUTE) {
  if (!(now instanceof Date) || !Number.isFinite(now.valueOf())) throw new TypeError("invalid_date");
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 ||
      !Number.isInteger(minute) || minute < 0 || minute > 59) throw new TypeError("invalid_update_time");
  const target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (target.getTime() <= now.getTime()) target.setDate(target.getDate() + 1);
  return target;
}
function restartStatePath(root) { return path.join(root, RESTART_FILE); }
function saveVmixUpdateRestore(root, version, isVmixOpen, now = Date.now()) {
  const target = restartStatePath(root);
  // No passwords, raw studio URLs, access tokens or personal data on disk.
  if (!isVmixOpen) {
    try { fs.rmSync(target, { force: true }); } catch {}
    return false;
  }
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i.test(version)) return false;
  const value = { version, wasOpen: true, savedAt: now };
  fs.mkdirSync(root, { recursive: true });
  const temp = target + "." + process.pid + ".tmp";
  fs.writeFileSync(temp, JSON.stringify(value), { mode: 0o600 });
  fs.renameSync(temp, target);
  return true;
}
function takeVmixUpdateRestore(root, runningVersion, now = Date.now()) {
  const target = restartStatePath(root);
  let record;
  try { record = JSON.parse(fs.readFileSync(target, "utf8")); } catch { return false; }
  try { fs.rmSync(target, { force: true }); } catch {}
  return Boolean(record?.wasOpen && record?.version === runningVersion &&
    typeof record.savedAt === "number" && record.savedAt <= now &&
    now - record.savedAt < RESTORE_VALID_MS);
}
module.exports = { DEFAULT_HOUR, DEFAULT_MINUTE, nextDailyInstallAt, saveVmixUpdateRestore, takeVmixUpdateRestore };
