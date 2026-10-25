# Desktop connection security acceptance criteria

The future Desktop shell may use the transport factory only when all of these remain true:

1. Endpoint parsing rejects HTTP and malformed or credential-bearing URIs.
2. TLS validation uses the platform trust chain and hostname/SAN validation without bypass callbacks.
3. Redirects are not followed automatically.
4. Station private CA installation is an explicit administrator-controlled provisioning step; the client never trusts a server-provided certificate automatically.
5. Device enrollment credentials are independent from TLS identity, scoped to one tenant/device, revocable, and stored outside renderer/browser storage.
6. A failed TLS validation is a hard connection failure. There is no “continue anyway” action.
7. Enrollment uses the existing one-time token API. The client persists a pending token/key pair with Windows DPAPI before network I/O so a lost response can be retried idempotently.
8. The device key is generated with a cryptographically secure random generator; tenant and role are accepted only from the server response.
9. An enrolled identity cannot be silently overwritten by another enrollment. Revocation remains enforced by the server.
10. The local API remains bound to loopback until the separate LAN security gate, firewall policy, and full LAN acceptance tests are approved.
11. No PostgreSQL port is exposed to workstations; Desktop communicates only with the versioned API.

This milestone adds a reusable pairing client and Windows-protected credential storage. It does not authorize LAN access or production rollout.
