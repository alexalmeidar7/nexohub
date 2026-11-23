"use strict";
// A bounded, tenant-isolated local transcript log. No uploads or cloud writes.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const MAX_FILE_BYTES = 3_000_000;
const RETAIN_ROWS = 2000;
const queues = new Map();
function tenantKey(tenantId) {
  if (typeof tenantId !== "string" || !/^[\w-]{3,160}$/.test(tenantId)) throw new Error("invalid_transcription_tenant");
  return crypto.createHash("sha256").update(tenantId).digest("hex");
}
function tenantFile(root, tenantId) {
  return path.join(root, "housemix-transcriptions", tenantKey(tenantId) + ".jsonl");
}
async function readRows(file) {
  let source;
  try { source = await fs.readFile(file, "utf8"); }
  catch (error) { if (error?.code === "ENOENT") return []; throw error; }
  // A bounded store prevents unbounded memory usage from accidental loops.
  if (source.length > MAX_FILE_BYTES * 4) throw new Error("local_transcription_store_too_large");
  return source.split("\n").filter(Boolean).slice(-RETAIN_ROWS).flatMap(line => {
    try {
      const value = JSON.parse(line);
      if (typeof value?.id === "string" && typeof value?.texto_transcrito === "string") return [value];
    } catch {}
    return [];
  });
}
async function listTranscriptions(root, tenantId) {
  const key = tenantKey(tenantId);
  if (queues.has(key)) await queues.get(key).catch(() => {});
  return (await readRows(tenantFile(root, tenantId))).slice(-500);
}
async function appendTranscription(root, tenantId, text, startTime, endTime) {
  const key = tenantKey(tenantId);
  if (typeof text !== "string" || !text.trim() || text.length > 10000) throw new Error("invalid_transcription_text");
  const start = new Date(startTime);
  const end = new Date(endTime);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) ||
      end.getTime() < start.getTime() || end.getTime() - start.getTime() > 15 * 60000) {
    throw new Error("invalid_transcription_timestamps");
  }
  const row = { id: crypto.randomUUID(), texto_transcrito: text.trim(),
    timestamp_inicio: start.toISOString(), timestamp_fim: end.toISOString() };
  const action = async () => {
    const file = tenantFile(root, tenantId);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, JSON.stringify(row) + "\n", { encoding: "utf8", mode: 0o600 });
    const stat = await fs.stat(file);
    if (stat.size >= MAX_FILE_BYTES) {
      const rows = await readRows(file);
      const tmp = file + "." + crypto.randomUUID() + ".tmp";
      await fs.writeFile(tmp, rows.map(x => JSON.stringify(x)).join("\n") + "\n", { mode: 0o600 });
      await fs.rename(tmp, file);
    }
    return row;
  };
  const operation = (queues.get(key) || Promise.resolve()).catch(() => {}).then(action);
  queues.set(key, operation);
  try { return await operation; }
  finally { if (queues.get(key) === operation) queues.delete(key); }
}
module.exports = { appendTranscription, listTranscriptions, tenantFile };
