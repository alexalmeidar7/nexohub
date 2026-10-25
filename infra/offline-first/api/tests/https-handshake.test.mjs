import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createServer } from "node:https";
import { get } from "node:https";
import { resolveTlsOptions } from "../tls-config.mjs";

function createCertificateFixture() {
  const dir = mkdtempSync(join(tmpdir(), "housemix-tls-"));
  const keyPath = join(dir, "localhost-key.pem");
  const certPath = join(dir, "localhost-cert.pem");
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", keyPath, "-out", certPath, "-days", "1",
    "-subj", "/CN=localhost",
    "-addext", "subjectAltName=DNS:localhost,IP:127.0.0.1"
  ], { stdio: "ignore" });
  return { dir, keyPath, certPath };
}

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = get(url, { ...options, minVersion: "TLSv1.2" }, (res) => {
      res.resume();
      res.on("end", () => resolve(res));
    });
    req.on("error", reject);
  });
}

test("HTTPS loopback handshake succeeds only when the client trusts the configured certificate", async () => {
  const fixture = createCertificateFixture();
  const server = createServer(
    resolveTlsOptions({
      HOUSEMIX_API_TLS: "true",
      HOUSEMIX_TLS_CERT_FILE: fixture.certPath,
      HOUSEMIX_TLS_KEY_FILE: fixture.keyPath
    }),
    (_req, res) => { res.writeHead(200); res.end("secure"); }
  );

  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    const url = `https://localhost:${address.port}/health`;
    const trusted = await request(url, { ca: readFileSync(fixture.certPath) });
    assert.equal(trusted.statusCode, 200);

    await assert.rejects(
      request(url),
      (error) => error.code === "UNABLE_TO_VERIFY_LEAF_SIGNATURE" ||
        error.code === "DEPTH_ZERO_SELF_SIGNED_CERT" ||
        error.code === "SELF_SIGNED_CERT_IN_CHAIN"
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(fixture.dir, { recursive: true, force: true });
  }
});

test("HTTPS refuses a certificate paired with the wrong private key", () => {
  const first = createCertificateFixture();
  const second = createCertificateFixture();
  try {
    assert.throws(
      () => resolveTlsOptions({
        HOUSEMIX_API_TLS: "true",
        HOUSEMIX_TLS_CERT_FILE: first.certPath,
        HOUSEMIX_TLS_KEY_FILE: second.keyPath
      }),
      /certificate configuration is invalid/
    );
  } finally {
    rmSync(first.dir, { recursive: true, force: true });
    rmSync(second.dir, { recursive: true, force: true });
  }
});
