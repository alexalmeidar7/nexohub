const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { validateStreamUrl, transcribeLocalAudio } = require("./local-whisper.cjs");
test("Whisper: rejects anything other than HTTP(S) stream URLs", () => {
  for (const source of ["file:///etc/passwd", "javascript:alert(1)", "ftp://foo", "http://user:pass@example.com/radio", "invalid"]) {
    assert.throws(() => validateStreamUrl(source), /invalid_audio_stream_url/);
  }
  assert.equal(validateStreamUrl("https://radio.example.com/live"), "https://radio.example.com/live");
});
test("Whisper: no external API, only local binaries and temporary files", async () => {
  const calls = []; let removed = false;
  const env = {
    HOUSEMIX_WHISPER_CLI_PATH: path.resolve("C:/programs/whisper-cli.exe"),
    HOUSEMIX_WHISPER_MODEL_PATH: path.resolve("C:/models/ggml-small.bin"),
    HOUSEMIX_FFMPEG_PATH: "ffmpeg",
  };
  const text = await transcribeLocalAudio("https://radio.example.com/stream", {
    env, createTemp: async () => path.resolve("fake-temp"),
    exec: async (exe, args) => { calls.push({ exe, args }); },
    read: async (file) => { assert.ok(file.endsWith("transcript.txt")); return "  Bom dia\n rádio! "; },
    remove: async () => { removed = true; },
  });
  assert.equal(text, "Bom dia rádio!");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].exe, "ffmpeg");
  assert.ok(calls[0].args.includes("https://radio.example.com/stream"));
  assert.equal(calls[1].exe, env.HOUSEMIX_WHISPER_CLI_PATH);
  assert.equal(removed, true);
});
test("Whisper: refuses to call cloud provider when local model isn't configured", async () => {
  await assert.rejects(transcribeLocalAudio("https://radio.example.com/live", {
    env: {},
    exec: async () => { throw new Error("must never run"); },
  }), /local_whisper_not_configured/);
});
