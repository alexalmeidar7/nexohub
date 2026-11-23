"use strict";
const fs = require("node:fs/promises");
const crypto = require("node:crypto");

/**
 * Atomic, content-addressed behavior without a hashing round trip: the local
 * file changes only if new XML bytes differ. Status events describe actual
 * writes, never periodic checks or identical responses.
 */
const queues = new Map();
async function persistOne(target, content, { io = fs, emit = () => {} } = {}) {
  let previous;
  try { previous = await io.readFile(target, "utf8"); }
  catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  if (previous === content) return { path: target, changed: false };
  const id = crypto.randomUUID();
  const temp = `${target}.${process.pid}.${id}.tmp`;
  try { emit({ id, operation: "write", phase: "start" }); } catch {}
  try {
    await io.writeFile(temp, content, "utf8");
    await io.rename(temp, target);
    try { emit({ id, operation: "write", phase: "end", ok: true }); } catch {}
    return { path: target, changed: true };
  } catch (error) {
    await io.rm(temp, { force: true }).catch(() => {});
    try { emit({ id, operation: "write", phase: "end", ok: false }); } catch {}
    throw error;
  }
}
// Per-path single-writer queue: two identical simultaneous refreshes yield
// one physical write, not two races or misleading activity events.
function writeXmlIfChanged(target, content, options = {}) {
  const previous = queues.get(target) || Promise.resolve();
  const operation = previous.catch(() => {}).then(() => persistOne(target, content, options));
  queues.set(target, operation);
  void operation.finally(() => { if (queues.get(target) === operation) queues.delete(target); }).catch(() => {});
  return operation;
}
module.exports = { writeXmlIfChanged };
