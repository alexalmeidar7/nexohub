# Local API prototype

This is an isolated, loopback-only development prototype. It is not connected to the current House Mix Web app or Lovable Cloud.

## Run locally

From the repository root, install the existing project dependencies, then:

```powershell
Copy-Item infra/offline-first/api/.env.example infra/offline-first/api/.env
# Set DATABASE_URL to the disposable local PostgreSQL instance.
$env:DATABASE_URL = "postgres://housemix_dev:YOUR_DB_PASSWORD@127.0.0.1:55432/housemix_local"
node infra/offline-first/api/server.mjs
```

Apply schema migrations in order (001, then 002) before starting the API. The service binds only to 127.0.0.1. LAN access is deliberately hard-disabled in code.

## Network exposure safety gate

The API currently accepts only `127.0.0.1`. Any other `HOUSEMIX_API_HOST` value causes startup to fail, including private LAN addresses and `0.0.0.0`. Setting `HOUSEMIX_ALLOW_LAN=true` does not bypass this guard.

Optional HTTPS transport can now be exercised on loopback only by setting `HOUSEMIX_API_TLS=true`, `HOUSEMIX_TLS_CERT_FILE` and `HOUSEMIX_TLS_KEY_FILE` to a matching PEM certificate/private-key pair. TLS enforces a minimum of TLS 1.2. With TLS unset, the existing loopback-only HTTP development mode remains unchanged. Invalid or incomplete TLS configuration fails startup.

**This does not enable LAN access.** `network-config.mjs` still hard-rejects every non-loopback bind, regardless of TLS settings or `HOUSEMIX_ALLOW_LAN`. Do not expose this prototype to another computer or use customer data. Server-certificate trust/hostname validation on the future Desktop client, firewall restrictions and the complete LAN acceptance suite remain required before any LAN pilot.

## Issue a one-time enrollment token

Run this only on the local server/administrator machine, with DATABASE_URL set:

```powershell
node infra/offline-first/api/scripts/issue-enrollment-token.mjs <tenant-slug> <primary_server|workstation|standby_server> [ttl-minutes]
```

The command creates a cryptographically random 256-bit token, stores only its SHA-256 hash, binds it to one active tenant and one device role, and defaults to a 60-minute expiry. TTL is limited to 5–1440 minutes. The plaintext token is displayed once; deliver it through a secure channel and do not log or commit it.

## Manage enrolled devices

Run these commands only on the local server/administrator machine with DATABASE_URL set:

```powershell
# List devices belonging to one tenant (credential hashes are never displayed)
node infra/offline-first/api/scripts/manage-devices.mjs list <tenant-slug>

# Revoke a device immediately
node infra/offline-first/api/scripts/manage-devices.mjs revoke <tenant-slug> <device-uuid>
```

The revoke command requires both the tenant slug and device UUID, rejects cross-tenant identifiers, runs in a transaction, and writes one `device.revoked` audit event. Repeating the command is safe and reports `already_revoked`. Revoked device keys stop authenticating immediately. This is a local operator CLI, not a remote admin endpoint or user-facing management screen.

## Endpoints

- `GET /health`: process/database health; no customer data.
- `POST /v1/devices/enroll`: body includes `enrollment_token`, a client-generated cryptographically random `device_key` (32+ chars), and `label`. Tenant and role are taken from the grant, never from client-supplied fields.
- `GET /v1/me`: requires `Authorization: Bearer <device_key>`.
- `POST /v1/sync/outbox`: writes events only under the authenticated device's tenant; repeated idempotency keys do not create duplicate events.
- `GET /v1/sync/changes`: paginates the authenticated tenant's change feed with an opaque cursor; page size is limited to 1–250.

Enrollment tokens are single-use, expire, can be revoked by setting `revoked_at`, and cannot enroll a second device. If the enrollment response is lost, the same token + same device key safely returns the already-created device; a different key is rejected.

## Current limitations — do not use with customer data

- Token issuance is a local operator/DB action, not yet an authenticated admin UI or remote identity system.
- No LAN binding, TLS, workstation pairing UX, operator login, full credential rotation UX, conflict resolution, backup scheduler, or standby failover yet.
- Device keys must be generated with a cryptographically secure random generator and stored securely by the future Desktop shell; never hardcode them.
- SHA-256 is used only to hash high-entropy random tokens and device keys, not human passwords.
- API is not exposed to browsers and must not receive requests from untrusted origins.
- This prototype is a milestone for local API contract validation, not a production server.
