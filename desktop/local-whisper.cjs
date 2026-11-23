"use strict";
// Uses ffmpeg + whisper.cpp installed locally. Executables/model paths are
// configured on the host; none are downloaded automatically.
const { spawn } = require("node:child_process");
const { mkdtemp, readFile, rm } = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
const { randomUUID } = require("node:crypto");

function validateStreamUrl(value) {
  if (typeof value !== "string" || value.length > 2048) throw new Error("invalid_audio_stream_url");
  let u; try { u = new URL(value); } catch { throw new Error("invalid_audio_stream_url"); }
  if (!["http:", "https:"].includes(u.protocol) || u.username || u.password ||
      !u.hostname || !u.port.match(/^[0-9]*$/)) throw new Error("invalid_audio_stream_url");
  return u.toString();
}

function runProcess(binary, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(binary, args, { windowsHide: true, shell: false, stdio: ["ignore", "ignore", "pipe"] });
    let settled = false; let stderr = "";
    const timeout = setTimeout(() => { child.kill(); settle(new Error("local_transcription_timeout")); }, timeoutMs);
    const settle = (error) => {
      if (settled) return; settled = true; clearTimeout(timeout);
      error ? reject(error) : resolve();
    };
    child.stderr.on("data", (chunk) => { if (stderr.length < 2000) stderr += String(chunk).slice(0, 1000); });
    child.on("error", () => settle(new Error("local_transcription_tool_missing")));
    child.on("close", code => settle(code === 0 ? null : new Error("local_transcription_process_failed")));
  });
}

let inProgress = false;
async function transcribeLocalAudio(streamUrl, {
  env = process.env, exec = runProcess, createTemp = mkdtemp,
  read = readFile, remove = rm,
} = {}) {
  const url = validateStreamUrl(streamUrl);
  if (inProgress) throw new Error("local_transcriber_busy");
  const model = env.HOUSEMIX_WHISPER_MODEL_PATH;
  const whisper = env.HOUSEMIX_WHISPER_CLI_PATH;
  if (typeof model !== "string" || !path.isAbsolute(model) ||
      typeof whisper !== "string" || !path.isAbsolute(whisper)) {
    throw new Error("local_whisper_not_configured");
  }
  const ffmpeg = env.HOUSEMIX_FFMPEG_PATH || "ffmpeg";
  if (typeof ffmpeg !== "string" || ffmpeg.length > 512) throw new Error("invalid_ffmpeg_path");
  inProgress = true; let temp = null;
  try {
    temp = await createTemp(path.join(os.tmpdir(), "housemix-whisper-"));
    const audioFile = path.join(temp, randomUUID() + ".wav");
    const textPrefix = path.join(temp, "transcript");
    await exec(ffmpeg, [
      "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
      "-t", "15", "-i", url, "-vn", "-ac", "1", "-ar", "16000",
      "-c:a", "pcm_s16le", audioFile,
    ], 35000);
    await exec(whisper, ["-m", model, "-l", "pt", "-f", audioFile, "-nt", "-otxt", "-of", textPrefix], 130000);
    const raw = await read(textPrefix + ".txt", "utf8");
    if (typeof raw !== "string") throw new Error("empty_local_transcription");
    return raw.replace(/\s+/g, " ").trim().slice(0, 10000);
  } finally {
    if (temp) await remove(temp, { recursive: true, force: true }).catch(() => {});
    inProgress = false;
  }
}
module.exports = { validateStreamUrl, transcribeLocalAudio };
