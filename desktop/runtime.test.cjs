const test = require("node:test");
const assert = require("node:assert/strict");
const { createWindowOptions, isAllowedExternalUrl } = require("./runtime.cjs");

test("renderer runs with isolated, sandboxed and non-Node web preferences", () => {
  const options = createWindowOptions("C:/HouseMix/preload.cjs");
  assert.equal(options.webPreferences.contextIsolation, true);
  assert.equal(options.webPreferences.nodeIntegration, false);
  assert.equal(options.webPreferences.sandbox, true);
  assert.equal(options.webPreferences.webSecurity, true);
  assert.equal(options.webPreferences.allowRunningInsecureContent, false);
});

test("only HTTP and HTTPS external links are allowed", () => {
  assert.equal(isAllowedExternalUrl("https://nexobrasil.com.br"), true);
  assert.equal(isAllowedExternalUrl("http://localhost:8787/health"), true);
  assert.equal(isAllowedExternalUrl("file:///C:/Windows/win.ini"), false);
  assert.equal(isAllowedExternalUrl("javascript:alert(1)"), false);
  assert.equal(isAllowedExternalUrl("not a url"), false);
});
