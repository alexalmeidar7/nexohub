const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { nextDailyInstallAt, saveVmixUpdateRestore, takeVmixUpdateRestore } = require("./auto-update-schedule.cjs");
test("daily automatic installation defaults to 00:30 in the machine's local time", () => {
  const before = new Date(2026, 10, 23, 0, 10, 0);
  const sameDay = nextDailyInstallAt(before);
  assert.equal(sameDay.getHours(), 0);
  assert.equal(sameDay.getMinutes(), 30);
  assert.equal(sameDay.getDate(), 23);
  const after = nextDailyInstallAt(new Date(2026, 10, 23, 0, 31));
  assert.equal(after.getHours(), 0);
  assert.equal(after.getMinutes(), 30);
  assert.equal(after.getDate(), 24);
});
test("vMix restart marker is version-bound, one-shot and contains no credentials", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hm-updater-"));
  const now = Date.now();
  try {
    assert.equal(saveVmixUpdateRestore(root, "1.0.31", true, now), true);
    const state = fs.readFileSync(path.join(root, "vmix-restore-after-update.json"), "utf8");
    assert.ok(!state.includes("password"));
    assert.equal(takeVmixUpdateRestore(root, "1.0.30", now + 1000), false);
    assert.equal(saveVmixUpdateRestore(root, "1.0.31", true, now), true);
    assert.equal(takeVmixUpdateRestore(root, "1.0.31", now + 1000), true);
    assert.equal(takeVmixUpdateRestore(root, "1.0.31", now + 2000), false);
    assert.equal(saveVmixUpdateRestore(root, "1.0.31", false, now), false);
    assert.equal(takeVmixUpdateRestore(root, "1.0.31", now + 1000), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
test("restoration expires and cannot launch arbitrary paths", () => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(), "hm-updater-"));
  try {
    const now=Date.now();
    saveVmixUpdateRestore(root, "1.0.31", true, now-90*60*60*1000);
    assert.equal(takeVmixUpdateRestore(root, "1.0.31", now), false);
    assert.equal(saveVmixUpdateRestore(root, "../evil", true, now), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
