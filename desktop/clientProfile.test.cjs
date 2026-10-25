const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { parseClientId, resolveClientProfile } = require("./clientProfile.cjs");

test("uses an explicit default profile when no client is selected", () => {
  assert.equal(parseClientId([]), "default");
});

test("normalizes a client id and creates a dedicated data directory", () => {
  const profile = resolveClientProfile(["--client-id=Radio-Positiva"], "C:/Users/Operator/AppData/Roaming");
  assert.equal(profile.clientId, "radio-positiva");
  assert.equal(
    profile.userDataPath,
    path.join("C:/Users/Operator/AppData/Roaming", "House Mix Desktop", "clients", "radio-positiva"),
  );
});

test("rejects path traversal and invalid characters", () => {
  assert.throws(() => parseClientId(["--client-id=../../other"]), /Identificador do cliente inválido/);
  assert.throws(() => parseClientId(["--client-id=radio/positiva"]), /Identificador do cliente inválido/);
});

test("rejects duplicate client id arguments", () => {
  assert.throws(() => parseClientId(["--client-id=radio-a", "--client-id=radio-b"]), /apenas um/);
});

test("creates distinct isolated directories for different clients", () => {
  const base = "C:/Users/Operator/AppData/Roaming";
  const first = resolveClientProfile(["--client-id=radio-positiva"], base);
  const second = resolveClientProfile(["--client-id=radio-cidade"], base);
  assert.notEqual(first.userDataPath, second.userDataPath);
});
