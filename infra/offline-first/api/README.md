# Local API prototype

This is an isolated, loopback-only development prototype. It is not connected to the current House Mix Web app or Lovable Cloud.

## Run locally

From the repository root, install the existing project dependencies, then:

```powershell
Copy-Item infra/offline-first/api/.env.example infra/offline-first/api/.env
# Edit .env: use the same strong DB password as infra/offline-first/.env
# and generate a separate random enrollment secret (32+ characters).
$env:DATABASE_URL = "postgres://housemix_dev:YOUR_DB_PASSWORD@127.0.0.1:55432/housemix_local"
$env:HOUSEMIX_ENROLLMENT_SECRET = "YOUR_RANDOM_ENROLLMENT_SECRET_32_CHARS_OR_MORE"
node infra/offline-first/api/server.mjs
```

The service binds only to 127.0.0.1. LAN access is deliberately blocked pending a separate security review.

## Endpoints

- `GET /health`: process/database health; no customer data.
- `POST /v1/devices/enroll`: requires `x-housemix-enrollment-secret`; body includes `tenant_slug`, a client-generated random `device_key` (32+ chars), `label`, and `device_role`. The database stores only its SHA-256 hash.
- `GET /v1/me`: requires `Authorization: Bearer <device_key>`; returns the authenticated device and tenant.
- `POST /v1/sync/outbox`: requires device authentication; writes events only under the authenticated device's tenant. Repeated idempotency keys do not create duplicate events.
- `GET /v1/sync/changes`: requires device authentication; paginates the authenticated tenant's change feed using an opaque continuation cursor. Page size is limited to 1–250; a cursor never grants access to another tenant.

## Current limitations — do not use with customer data

- Enrollment secret is a single local bootstrap secret, not a complete operator/admin identity system.
- No LAN binding, TLS, workstation pairing UX, operator login, full credential lifecycle, conflict resolution, backup scheduler, or standby failover yet. The new pull endpoint is a prototype feed, not a complete bidirectional sync engine.
- Device keys must be generated with a cryptographically secure random generator and stored securely by the future Desktop shell; never hardcode them.
- SHA-256 is used only to hash high-entropy random device keys, not human passwords.
- API is not exposed to browsers and must not receive requests from untrusted origins.
- Tenant isolation is scoped in every API query and reinforced by composite foreign keys, but a full authorization review and negative integration tests are still required before production use.

This prototype is a milestone for local API contract validation, not a production server.
