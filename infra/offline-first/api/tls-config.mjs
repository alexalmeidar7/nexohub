import { readFileSync } from "node:fs";
import { createSecureContext } from "node:tls";

/**
 * Optional HTTPS transport for the loopback-only API prototype.
 * This module deliberately does not decide or enable network exposure.
 */
export function resolveTlsOptions(env = process.env, readFile = readFileSync) {
  const enabled = env.HOUSEMIX_API_TLS;
  if (enabled === undefined || enabled === "" || enabled === "false") return null;
  if (enabled !== "true") {
    throw new Error("HOUSEMIX_API_TLS must be either 'true' or 'false'.");
  }

  const certPath = env.HOUSEMIX_TLS_CERT_FILE;
  const keyPath = env.HOUSEMIX_TLS_KEY_FILE;
  if (typeof certPath !== "string" || certPath.trim() === "" ||
      typeof keyPath !== "string" || keyPath.trim() === "") {
    throw new Error("HTTPS requires both HOUSEMIX_TLS_CERT_FILE and HOUSEMIX_TLS_KEY_FILE.");
  }

  let cert;
  let key;
  try {
    cert = readFile(certPath);
    key = readFile(keyPath);
    // Parse and validate the PEM material and matching key pair before opening a socket.
    createSecureContext({ cert, key, minVersion: "TLSv1.2" });
  } catch {
    throw new Error("HTTPS certificate configuration is invalid or the certificate and private key do not match.");
  }

  return { cert, key, minVersion: "TLSv1.2", honorCipherOrder: true };
}
