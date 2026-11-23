const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { writeXmlIfChanged } = require("./local-xml-write.cjs");

test("identical XML never touches disk or emits a fake save", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "housemix-xml-write-"));
  const file = path.join(tmp, "geral.xml");
  const events = [];
  try {
    const a = await writeXmlIfChanged(file, "<info>1</info>", { emit: x => events.push(x) });
    assert.equal(a.changed, true);
    assert.equal(events.length, 2);
    const first = await fs.stat(file);
    const b = await writeXmlIfChanged(file, "<info>1</info>", { emit: x => events.push(x) });
    const second = await fs.stat(file);
    assert.equal(b.changed, false);
    assert.equal(events.length, 2);
    assert.equal(second.mtimeMs, first.mtimeMs);
    const c = await writeXmlIfChanged(file, "<info>2</info>", { emit: x => events.push(x) });
    assert.equal(c.changed, true);
    assert.equal(events.length, 4);
    assert.equal(await fs.readFile(file, "utf8"), "<info>2</info>");
  } finally { await fs.rm(tmp, { recursive: true, force: true }); }
});

test("failed writes report failure and do not leave temp files", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "housemix-xml-error-"));
  const file = path.join(tmp, "enquete.xml"), events = [];
  try {
    await assert.rejects(writeXmlIfChanged(file, "<info/>", {
      emit: x => events.push(x),
      io: {
        readFile: fs.readFile,
        writeFile: async () => { throw new Error("disk full"); },
        rename: fs.rename,
        rm: fs.rm,
      },
    }), /disk full/);
    assert.equal(events.length, 2);
    assert.equal(events[1].ok, false);
    assert.deepEqual(await fs.readdir(tmp), []);
  } finally { await fs.rm(tmp, { recursive: true, force: true }); }
});

test("simultaneous identical XML refreshes write only once", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "housemix-xml-race-"));
  const file = path.join(tmp, "broadcast.xml"), events = [];
  try {
    const results = await Promise.all(Array.from({length:8}, () =>
      writeXmlIfChanged(file, "<same/>", { emit: x => events.push(x) })));
    assert.equal(results.filter(r => r.changed).length, 1);
    assert.equal(events.length, 2);
  } finally { await fs.rm(tmp, { recursive: true, force: true }); }
});
