const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createLocalMusicSourceManager } = require("./local-music-source.cjs");

test("one consented file selection persists across app restarts, without a permission prompt", async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hm-radio-"));
  const file = path.join(root, "RDS.txt"); await fsp.writeFile(file, "ARTISTA - MUSICA");
  const openWatchers = [];
  const watch = (_folder, _options, listener) => {
    const w = { close() {}, on() {}, fire: () => listener("change", "RDS.txt") };
    openWatchers.push(w); return w;
  };
  try {
    const manager = createLocalMusicSourceManager(root, () => {}, { watch });
    assert.equal((await manager.savePickedSource("radio-01", file)).name, "RDS.txt");
    assert.equal((await manager.read("radio-01")).content, "ARTISTA - MUSICA");
    assert.equal((await manager.read("radio-01")).changed, false);
    assert.equal((await manager.read("radio-02")), null);
    manager.close();
    const reopened = createLocalMusicSourceManager(root, () => {}, { watch });
    assert.equal(reopened.getSource("radio-01").configured, true);
    assert.equal((await reopened.read("radio-01")).changed, true);
    reopened.close();
  } finally { await fsp.rm(root, { recursive: true, force: true }); }
});
test("rejects invalid station IDs and arbitrary files, preventing path traversal", async () => {
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "hm-radio-"));
  const mgr = createLocalMusicSourceManager(root, () => {}, {watch:()=>({close(){},on(){}})});
  try {
    await assert.rejects(mgr.savePickedSource("../../private", path.join(root,"x.txt")), /invalid_local_music_source/);
    await assert.rejects(mgr.savePickedSource("radio-01", path.join(root,"secret.exe")), /invalid_local_music_source/);
  } finally { mgr.close(); await fsp.rm(root, { recursive: true, force: true }); }
});
