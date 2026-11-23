const test = require("node:test");
const assert = require("node:assert/strict");
const { generateLocalText, ENDPOINT } = require("./local-free-ai.cjs");
test("Ollama: sends prompt only to loopback and never uses a paid endpoint", async () => {
  let count = 0;
  const result = await generateLocalText({ system: "responda em português", prompt: "Resuma esta notícia" }, {
    env: { HOUSEMIX_OLLAMA_MODEL: "qwen2.5:3b" },
    transport: async (url, options) => {
      count++;
      assert.equal(url, ENDPOINT);
      assert.ok(url.startsWith("http://127.0.0.1:11434/"));
      const body = JSON.parse(options.body);
      assert.equal(body.stream, false);
      assert.equal(body.model, "qwen2.5:3b");
      return { ok: true, json: async () => ({ message: { content: "Resumo local pronto." } }) };
    },
  });
  assert.equal(count, 1);
  assert.equal(result, "Resumo local pronto.");
});
test("Ollama: invalid inputs do not trigger calls", async () => {
  let calls = 0;
  const transport = async () => { calls++; throw new Error("should not call"); };
  await assert.rejects(generateLocalText({ system: "a", prompt: "" }, { transport }), /invalid_local_ai_prompt/);
  await assert.rejects(generateLocalText({ system: "a", prompt: "a".repeat(6501) }, { transport }), /invalid_local_ai_prompt/);
  await assert.rejects(generateLocalText({ system: "a", prompt: "ok" }, { transport, env: { HOUSEMIX_OLLAMA_MODEL: "http://example.com" } }), /invalid_ollama_model/);
  assert.equal(calls, 0);
});
test("Ollama: service failure never falls back to OpenAI", async () => {
  let calls = 0;
  await assert.rejects(generateLocalText({ system: "s", prompt: "p" }, {
    transport: async (url) => { calls++; assert.equal(url, ENDPOINT); return { ok: false, status: 503 }; },
  }), /ollama_unavailable_or_model_missing/);
  assert.equal(calls, 1);
});
