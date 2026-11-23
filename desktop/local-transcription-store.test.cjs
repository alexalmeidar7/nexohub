const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { appendTranscription, listTranscriptions, tenantFile } = require("./local-transcription-store.cjs");

test("local transcripts: persist independently by station and survive reload", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "housemix-history-test-"));
  try {
    const t0 = new Date("2026-11-23T10:00:00Z").toISOString(), t1 = new Date("2026-11-23T10:00:15Z").toISOString();
    const [first, second] = await Promise.all([
      appendTranscription(root, "station-one", "Locução A", t0, t1),
      appendTranscription(root, "station-one", "Locução B", t0, t1),
    ]);
    assert.notEqual(first.id, second.id);
    const rows = await listTranscriptions(root, "station-one");
    assert.equal(rows.length, 2);
    assert.deepEqual(await listTranscriptions(root, "station-two"), []);
    assert.ok(tenantFile(root, "station-one").startsWith(root));
    assert.notEqual(tenantFile(root, "station-one"), tenantFile(root, "station-two"));
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});
test("local transcripts: reject traversal and malformed input", async () => {
  assert.throws(() => tenantFile("/tmp/hm", "../../etc/passwd"), /invalid_transcription_tenant/);
  await assert.rejects(appendTranscription("/tmp", "station", "", "2026-11-23", "2026-11-23"), /invalid_transcription_text/);
});
