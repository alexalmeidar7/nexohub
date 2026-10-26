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

Apply control-plane migrations 001–003 and initialize each radio database using `bootstrap-tenant-schema.mjs` before starting sync traffic. The tenant bootstrap now applies the baseline (001), sync (002), durable checkpoint (003), inbox (004),  inbox lease (005), and isolated Programas/Agenda domain (006) migrations in order. The service binds only to 127.0.0.1. LAN access is deliberately hard-disabled in code.

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
- `GET /v1/tenant/diagnostics`: requires device authentication and, when the protected Windows DPAPI vault is configured, opens only that device's active radio database and runs a read-only `SELECT 1`. It returns readiness only, never database credentials or connection details.
- `POST /v1/sync/outbox`: opens the authenticated radio's isolated database and writes to `housemix.sync_outbox`; repeated idempotency keys do not create duplicate events.
- `GET /v1/sync/changes`: reads only that radio's outbox using a durable per-device checkpoint; page size is limited to 1–250. The server records the issued acknowledgement cursor before returning a page.
- `POST /v1/sync/ack`: accepts only the exact cursor previously issued to that authenticated device, then advances that device's checkpoint. Replayed, forged, or cross-device acknowledgements are rejected.
- `POST /v1/sync/inbox`: durably accepts a remote mutation into the authenticated radio's inbox, keyed by a globally unique mutation UUID. Reusing an ID with different content is rejected; this endpoint only queues the mutation and does not apply business-table changes.
- Internal inbox worker primitives claim bounded batches using row locks and short-lived lease tokens. The domain applier accepts only schema version 1 and explicit `programa` / `agenda_evento` field allowlists, checks optimistic `row_version`, and commits each domain mutation with its terminal inbox status in one transaction. Stale leases are ignored; stale versions become `conflict`; invalid envelopes or fields become `rejected`. This is a tested application primitive and is not yet activated by a production background worker. Both routes fail closed with 503 until the protected DPAPI tenant runtime is configured.

Enrollment tokens are single-use, expire, can be revoked by setting `revoked_at`, and cannot enroll a second device. If the enrollment response is lost, the same token + same device key safely returns the already-created device; a different key is rejected.

## Protected tenant runtime diagnostic

On the Windows host, publish `HouseMix.OfflineFirst.VaultHost` and set both `HOUSEMIX_DPAPI_VAULT_HOST` (absolute executable path) and `HOUSEMIX_TENANT_CREDENTIALS_ROOT` (absolute protected credential-store root). Configure both together; the API refuses a partial configuration. The authenticated diagnostic endpoint then uses the device-authenticated tenant UUID, the active control-plane registry entry and that tenant's DPAPI-protected runtime secret. It runs only `SELECT 1`, returns a readiness flag, and closes the tenant connection after the request. Without both settings, the endpoint returns `503 tenant_runtime_not_configured`. The endpoint is a validation probe, not a production feature or a data migration.

## Current limitations — do not use with customer data

- Token issuance is a local operator/DB action, not yet an authenticated admin UI or remote identity system.
- No LAN binding, Desktop certificate trust/hostname validation, workstation pairing UX, operator login, full credential rotation UX, conflict resolution, backup scheduler, or standby failover yet.
- Device keys must be generated with a cryptographically secure random generator and stored securely by the future Desktop shell; never hardcode them.
- SHA-256 is used only to hash high-entropy random tokens and device keys, not human passwords.
- API is not exposed to browsers and must not receive requests from untrusted origins.
- This prototype is a milestone for local API contract validation, not a production server.

## Provision a dedicated radio database (local operator only)

After migrations 001, 002 and 003 have been applied to the control-plane catalog, provision one empty database for an active tenant:

```powershell
$env:DATABASE_URL = "postgres://catalog_operator:...@127.0.0.1:55432/housemix_local"
$env:DATABASE_ADMIN_URL = "postgres://housemix_provisioner:...@127.0.0.1:55432/postgres"
node infra/offline-first/api/scripts/provision-tenant-database.mjs <tenant-slug>
```

The provisioning connection must be a dedicated local PostgreSQL role with only the privileges needed to create roles and databases (CREATEROLE and CREATEDB); do not use the postgres superuser for normal operation. The script creates a deterministic database name and a per-tenant NOLOGIN owner role, verifies ownership, and can safely resume after interruption. The database remains in `provisioning` and is not activated for application traffic. Tenant schema migrations, runtime login roles, grants, backup policy, and activation are separate reviewed steps. Never point this script at production or customer data during this prototype phase.

## Initialize a provisioned radio database schema

After the dedicated database has been created and verified by the provisioning step, initialize its isolated baseline schema:

```powershell
node infra/offline-first/api/scripts/bootstrap-tenant-schema.mjs <tenant-slug>
```

The command resolves the database only from the active tenant's control-plane mapping, verifies the deterministic tenant/database relationship and actual PostgreSQL owner, then applies migrations 001 (baseline) and 002 (sync) in order under the tenant's non-login owner role. It stores a SHA-256 checksum for each migration in `housemix.schema_migrations`; reruns verify the checksums and reject modified migrations. It does not create workstation login credentials, mark the tenant active, or enable network access.

## Per-radio synchronization schema (migration 002)

Each radio database receives its own synchronization tables in `housemix` through `infra/offline-first/schema/tenant/002_sync.sql`, applied only after tenant baseline migration 001 and while connected as that radio database's owner role. It creates a local outbox with idempotency enforcement, a per-device checkpoint table, and an audit event ledger. The schema deliberately omits `tenant_id`: the separate PostgreSQL database is the isolation boundary. Public table and sequence privileges are revoked. CI validates the schema and its payload constraints against disposable PostgreSQL. The HTTP sync endpoints now use this per-radio schema through the authenticated request-scoped runtime; they return 503 until the Windows DPAPI runtime is configured.

## Create least-privilege runtime credentials for a radio

After a radio database has been provisioned and its baseline schema initialized, an operator can create its dedicated application login:

```powershell
node infra/offline-first/api/scripts/provision-tenant-runtime-credentials.mjs <tenant-slug>
```

The command creates a unique per-tenant LOGIN role with no superuser, database-creation, role-creation, replication, or RLS-bypass privileges. It grants CONNECT only to that tenant database, plus schema usage and CRUD rights inside `housemix`; default privileges apply to future tables/sequences created by the tenant owner. A fresh high-entropy password is displayed once. Do not redirect terminal output or store it in logs; secure local secret-store integration and rotation are a separate step. This does not activate the tenant or enable LAN.

## Rotate an active radio's runtime password

Run this command on the local server/administrator machine when a radio's PostgreSQL runtime password must be replaced:

```powershell
node infra/offline-first/api/scripts/rotate-tenant-runtime-credentials.mjs <tenant-slug>
```

The command accepts only an active tenant whose database mapping matches its UUID. It verifies database ownership and least-privilege role flags, replaces the password on that radio's dedicated runtime role, and displays the new random secret once. **The old password stops working immediately.** Securely save the new secret in that radio's local DPAPI credential vault before reconnecting its House Mix Desktop instances. This prototype command does not remotely distribute the new secret, provide zero-downtime dual-password rotation, or update workstation vaults automatically. If the one-time output is lost, run rotation again and securely store the newly issued password.

## PostgreSQL cross-radio connection isolation

Each provisioned radio database removes PostgreSQL's default `CONNECT` privilege from `PUBLIC`, then explicitly preserves access for the local provisioning operator. The radio's dedicated runtime login receives `CONNECT` only on its own database. Runtime credential provisioning also removes any existing role memberships in either direction and verifies that none remain, preventing unexpected inherited or delegated role access. These safeguards apply when a database is provisioned or its runtime credentials are provisioned again; they do not retroactively harden databases that have not passed through these steps. Run this only against disposable local test databases until the full acceptance suite is complete.

## Activate a radio database after verification

Only after database provisioning, schema bootstrap, and runtime credential provisioning have completed, an operator may run:

```powershell
node infra/offline-first/api/scripts/activate-tenant-database.mjs <tenant-slug>
```

The activation gate rechecks the tenant UUID/database mapping, deterministic owner, exact baseline migration checksum, dedicated runtime login and its restricted role flags, absence of role memberships, removal of PUBLIC CONNECT, and the runtime login's database/schema grants. It changes the registry from `provisioning` to `active` only after every check succeeds. This marks the isolated database infrastructure as provisioned; it does not mean application tables, data migration, workstation connectivity, backups, or failover are ready. Run only against disposable local test databases until the full acceptance suite is complete.

## Resolve the runtime database for an authenticated radio

The API runtime can now resolve a tenant-specific PostgreSQL client using only the tenant UUID from the authenticated request context. It checks the control-plane registry is `active`, recomputes the deterministic database and runtime-role names, retrieves the matching secret through an injected local secret-vault provider, and builds the connection URL from the configured loopback PostgreSQL origin. Client-supplied tenant slugs, database names, passwords, and connection URLs are never used for routing.

The resolver is a tested integration boundary, not yet wired into the HTTP request handlers. The secret-vault provider must be backed by the per-radio protected credential store before runtime use; do not use an in-memory placeholder or expose secrets to logs. The current host policy is loopback-only and must remain so until the separately gated TLS/LAN acceptance work is complete.

## Control-plane tenant registry adapter

`createTenantRegistryLookup(controlPlaneDb)` implements the registry provider used by the tenant runtime router. It accepts only the authenticated tenant UUID, performs a parameterized lookup in `tenant_database_registry`, and verifies that the stored database key matches the deterministic key for that UUID. It returns the registry status unchanged; the runtime router remains responsible for rejecting anything other than `active`.

This adapter does not retrieve or persist runtime passwords and does not create database connections by itself. The protected server-side secret-vault integration and request-handler wiring remain separate gated steps.

## Compose the per-radio runtime service

`createTenantRuntimeService` composes the control-plane registry adapter and the authenticated-tenant database resolver. The caller supplies a protected secret-vault implementation and a PostgreSQL client factory. Each open operation accepts only the tenant UUID already established by server-side device authentication; it verifies the active registry mapping, retrieves that tenant's runtime secret, and only then creates a tenant-scoped PostgreSQL client.

The service deliberately has no default vault, environment-variable password fallback, or in-memory secret store. Construction fails unless an explicit protected vault provider is supplied, and no PostgreSQL client is created when the tenant is inactive or its secret is invalid. This is a tested composition boundary; it is not yet wired into HTTP handlers. Keep the existing control-plane endpoints unchanged until the OS-protected server vault and request lifecycle integration are reviewed.

## Windows DPAPI vault host bridge

The Windows-only `HouseMix.OfflineFirst.VaultHost` helper exposes the existing DPAPI credential store to the Node API through private stdin/stdout pipes. Build it with:

```powershell
dotnet publish infra/offline-first/desktop-client/HouseMix.OfflineFirst.VaultHost/HouseMix.OfflineFirst.VaultHost.csproj -c Release -r win-x64 --self-contained true
```

The Node adapter in `dpapi-tenant-secret-vault.mjs` requires an absolute path to the published helper and an absolute credentials root. It derives the tenant credential directory from the UUID supplied by the authenticated request context, passes no password or secret on the command line, discards helper stderr, bounds execution time/output, validates the returned tenant/database/role tuple, and fails closed on helper errors. The helper itself requires Windows DPAPI CurrentUser and never returns a secret for a different tenant.

Example composition:

```js
import postgres from "postgres";
import { createTenantRuntimeService } from "./tenant-runtime-service.mjs";
import { createDpapiTenantSecretVault } from "./dpapi-tenant-secret-vault.mjs";

const secretVault = createDpapiTenantSecretVault({
  executablePath: process.env.HOUSEMIX_DPAPI_VAULT_HOST,
  credentialsRoot: process.env.HOUSEMIX_TENANT_CREDENTIALS_ROOT,
});
const tenantRuntime = createTenantRuntimeService({
  controlPlaneDb,
  secretVault,
  controlPlaneUrl: process.env.DATABASE_URL,
  postgresFactory: (url, options) => postgres(url, options),
});
```

This is a host bridge and composition primitive; it does not yet attach tenant-scoped clients to HTTP routes or change the existing control-plane endpoints. Keep the API loopback-only. The credentials root must be the protected server-side tenant vault root, not a path supplied by a browser or workstation.
