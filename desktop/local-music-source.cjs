"use strict";
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const FILE_LIMIT_BYTES = 2_000_000;
const ALLOWED_EXTENSIONS = new Set([".xml", ".txt", ".log", ".nowplaying"]);
function validStation(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{3,110}$/.test(id);
}
function validLocalMusicPath(p) {
  return typeof p === "string" && path.isAbsolute(p) &&
    ALLOWED_EXTENSIONS.has(path.extname(p).toLowerCase());
}
function createLocalMusicSourceManager(root, onChange = () => {}, options = {}) {
  const io = options.io || fsp;
  const watch = options.watch || fs.watch;
  const sourceFile = path.join(root, "local-music-sources.json");
  const watchers = new Map(), lastRead = new Map();
  let sources = {};
  try {
    const saved = JSON.parse(fs.readFileSync(sourceFile, "utf8"));
    if (saved && typeof saved === "object" && !Array.isArray(saved)) {
      for (const [id, p] of Object.entries(saved)) {
        if (validStation(id) && validLocalMusicPath(p)) sources[id] = p;
      }
    }
  } catch { /* first launch */ }
  async function persist() {
    await io.mkdir(root, { recursive: true });
    const tmp = sourceFile + "." + process.pid + ".tmp";
    try {
      await io.writeFile(tmp, JSON.stringify(sources, null, 2), { encoding: "utf8", mode: 0o600 });
      await io.rename(tmp, sourceFile);
    } catch (error) {
      await io.rm(tmp, { force: true }).catch(() => {});
      throw error;
    }
  }
  function closeWatcher(id) {
    const current = watchers.get(id);
    if (!current) return;
    clearTimeout(current.debounce);
    try { current.watcher.close(); } catch {}
    watchers.delete(id);
  }
  function startWatcher(id) {
    closeWatcher(id);
    const file = sources[id];
    if (!file) return;
    try {
      const entry = { watcher: null, debounce: null };
      entry.watcher = watch(path.dirname(file), { persistent: false }, (_type, name) => {
        if (name && String(name).toLowerCase() !== path.basename(file).toLowerCase()) return;
        clearTimeout(entry.debounce);
        entry.debounce = setTimeout(() => {
          lastRead.delete(id); // writer could replace file without changing timestamp
          onChange(id);
        }, 180);
      });
      entry.watcher.on?.("error", () => closeWatcher(id));
      watchers.set(id, entry);
    } catch { /* fallback: the caller will still run occasional safety checks */ }
  }
  function getSource(id) {
    if (!validStation(id)) throw new Error("invalid_station");
    const file = sources[id];
    if (file && !watchers.has(id)) startWatcher(id);
    return file ? { configured: true, name: path.basename(file) } : { configured: false, name: "" };
  }
  async function savePickedSource(id, selectedPath) {
    if (!validStation(id) || !validLocalMusicPath(selectedPath)) throw new Error("invalid_local_music_source");
    const stat = await io.stat(selectedPath);
    if (!stat.isFile() || stat.size > FILE_LIMIT_BYTES) throw new Error("invalid_local_music_file");
    sources[id] = selectedPath;
    lastRead.delete(id);
    await persist();
    startWatcher(id);
    return getSource(id);
  }
  async function read(id) {
    const source = getSource(id);
    if (!source.configured) return null;
    const file = sources[id];
    const stat = await io.stat(file);
    if (!stat.isFile() || stat.size > FILE_LIMIT_BYTES) throw new Error("invalid_local_music_file");
    const signature = [stat.size, stat.mtimeMs, stat.ino].join(":");
    const existing = lastRead.get(id);
    if (existing?.signature === signature) return { name: source.name, changed: false, lastModified: stat.mtimeMs };
    const buffer = await io.readFile(file);
    // Allow radio encodings; the UI already has an XML/TXT parser and normalizer.
    const bytes = new Uint8Array(buffer);
    const head = buffer.subarray(0, 256).toString("latin1");
    const declared = head.match(/<\?xml[^>]*encoding\s*=\s*["']([^"']+)["']/i)?.[1];
    let content;
    if (bytes[0] === 0xff && bytes[1] === 0xfe) content = new TextDecoder("utf-16le").decode(bytes);
    else if (bytes[0] === 0xfe && bytes[1] === 0xff) content = new TextDecoder("utf-16be").decode(bytes);
    else {
      try { content = new TextDecoder(declared || "utf-8", { fatal: true }).decode(bytes); }
      catch { content = new TextDecoder("windows-1252").decode(bytes); }
    }
    if (existing?.content === content) {
      lastRead.set(id, { signature, content });
      return { name: source.name, changed: false, lastModified: stat.mtimeMs };
    }
    lastRead.set(id, { signature, content });
    return { name: source.name, content, lastModified: stat.mtimeMs, changed: true };
  }
  function close() {
    for (const id of [...watchers.keys()]) closeWatcher(id);
  }
  return { getSource, savePickedSource, read, close };
}
module.exports = { createLocalMusicSourceManager, validStation, validLocalMusicPath };
