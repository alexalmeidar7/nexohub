const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createWindowOptions, isAllowedExternalUrl, resolveRendererRequestPath } = require("./runtime.cjs");

test("renderer runs with isolated, sandboxed and non-Node web preferences", () => {
  const options = createWindowOptions("C:/HouseMix/preload.cjs");
  assert.equal(options.webPreferences.contextIsolation, true);
  assert.equal(options.webPreferences.nodeIntegration, false);
  assert.equal(options.webPreferences.sandbox, true);
  assert.equal(options.webPreferences.webSecurity, true);
  assert.equal(options.webPreferences.allowRunningInsecureContent, false);
  assert.equal(options.webPreferences.backgroundThrottling, false);
});

test("only HTTP and HTTPS external links are allowed", () => {
  assert.equal(isAllowedExternalUrl("https://nexobrasil.com.br"), true);
  assert.equal(isAllowedExternalUrl("http://localhost:8787/health"), true);
  assert.equal(isAllowedExternalUrl("file:///C:/Windows/win.ini"), false);
  assert.equal(isAllowedExternalUrl("javascript:alert(1)"), false);
  assert.equal(isAllowedExternalUrl("not a url"), false);
});

test("desktop renderer root resolves to the SPA entry point", () => {
  const root = path.resolve("C:/HouseMix/resources/app/dist");
  const exists = (candidate) => candidate === path.join(root, "index.html");
  assert.equal(resolveRendererRequestPath("housemix://desktop/", root, exists), path.join(root, "index.html"));
});

test("extensionless BrowserRouter routes fall back to index.html", () => {
  const root = path.resolve("C:/HouseMix/resources/app/dist");
  const entry = path.join(root, "index.html");
  assert.equal(resolveRendererRequestPath("housemix://desktop/home", root, (candidate) => candidate === entry), entry);
});

test("missing static assets and paths outside renderer root are rejected", () => {
  const root = path.resolve("C:/HouseMix/resources/app/dist");
  assert.equal(resolveRendererRequestPath("housemix://desktop/assets/missing.js", root, () => false), null);
  assert.equal(resolveRendererRequestPath("https://example.com/", root, () => true), null);
  assert.equal(resolveRendererRequestPath("housemix://desktop/%2e%2e/secrets.txt", root, () => true), null);
});
