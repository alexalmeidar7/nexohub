"use strict";
// The Desktop always connects to the loopback Ollama server. It never sends a
// local prompt to an arbitrary host or a billable cloud API.
const ENDPOINT = "http://127.0.0.1:11434/api/chat";
const DEFAULT_MODEL = "qwen2.5:3b";
function safePrompt(value, maximum) {
  if (typeof value !== "string" || !value.trim() || value.length > maximum) {
    throw new Error("invalid_local_ai_prompt");
  }
  return value.trim();
}
async function generateLocalText(payload, { transport = globalThis.fetch, env = process.env } = {}) {
  const system = safePrompt(payload?.system, 3500);
  const prompt = safePrompt(payload?.prompt, 6500);
  const model = (env.HOUSEMIX_OLLAMA_MODEL || DEFAULT_MODEL).trim();
  if (!/^[a-zA-Z0-9_.:/-]{1,90}$/.test(model)) throw new Error("invalid_ollama_model");
  const response = await transport(ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model, stream: false, keep_alive: "5m",
      messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
      options: { temperature: 0.35, num_predict: 440 },
    }),
    signal: AbortSignal.timeout(90000),
  });
  if (!response.ok) throw new Error("ollama_unavailable_or_model_missing");
  const data = await response.json();
  const answer = data?.message?.content;
  if (typeof answer !== "string" || !answer.trim()) throw new Error("empty_local_ai_response");
  if (answer.length > 24000) throw new Error("local_ai_response_too_large");
  return answer.trim();
}
module.exports = { generateLocalText, ENDPOINT };
