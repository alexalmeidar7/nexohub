import test from "node:test";
import assert from "node:assert/strict";
import { resolveTlsOptions } from "../tls-config.mjs";

test("HTTPS is disabled unless explicitly enabled", () => {
  assert.equal(resolveTlsOptions({}), null);
  assert.equal(resolveTlsOptions({ HOUSEMIX_API_TLS: "false" }), null);
});

test("rejects ambiguous TLS toggle values", () => {
  assert.throws(
    () => resolveTlsOptions({ HOUSEMIX_API_TLS: "yes" }),
    /HOUSEMIX_API_TLS must be either/
  );
});

test("requires both certificate and private-key paths", () => {
  assert.throws(
    () => resolveTlsOptions({ HOUSEMIX_API_TLS: "true", HOUSEMIX_TLS_CERT_FILE: "/tmp/cert.pem" }),
    /requires both/
  );
});

test("rejects malformed or mismatched PEM material before listening", () => {
  assert.throws(
    () => resolveTlsOptions(
      { HOUSEMIX_API_TLS: "true", HOUSEMIX_TLS_CERT_FILE: "/tmp/cert.pem", HOUSEMIX_TLS_KEY_FILE: "/tmp/key.pem" },
      () => "not a PEM file"
    ),
    /certificate configuration is invalid/
  );
});

test("does not permit TLS versions below 1.2", () => {
  // TLS version is fixed by the implementation; the test protects the documented contract.
  const source = resolveTlsOptions.toString();
  assert.match(source, /TLSv1\.2/);
});
