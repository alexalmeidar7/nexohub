# House Mix Offline First — Architecture RFC

Status: proposed architecture approved for isolated implementation planning
Date: 2026-10-24
Scope: new desktop/local-server architecture only. This RFC does not change production runtime, database, authentication, storage, or deployments.

## 1. Product direction

House Mix Desktop becomes the primary operational product. House Mix Web remains the remote administration, reporting, and management companion. A radio must continue its core studio operations when the internet, cloud services, or the Web application are unavailable.

Each radio/customer (tenant) owns an isolated data domain. No installation, synchronization worker, API, or administrator may read or write another tenant's data without explicit authorization.

## 2. Approved topology

- One **Primary Station Server** per radio: Windows service host, local PostgreSQL, authenticated LAN API, sync agent, local media cache, health monitor, and vMix integration.
- LAN workstations: House Mix Desktop clients. They access the primary through the LAN API; they never open PostgreSQL files or connect directly to the database.
- One **Standby Station Server**: separate machine with a continuously maintained PostgreSQL replica and replicated required configuration/media. It is not writable while standby.
- Independent backups: encrypted, versioned backups separate from both machines, with an off-site copy whenever internet is available.
- House Mix Cloud: remote synchronization relay / Web data service. It is not required for core local operation.
- House Mix Web: accesses only the tenant-authorized cloud data plane and queues remote mutations for delivery to that tenant's station server.

## 3. Data ownership and tenant isolation

Every synchronized entity must carry:
- tenant_id: immutable customer/station identifier;
- entity_id: globally unique stable identifier (UUID);
- origin_device_id: device that originated the mutation;
- mutation_id: globally unique idempotency key;
- version / base_version: optimistic concurrency metadata;
- created_at and updated_at: UTC timestamps;
- deleted_at or explicit tombstone for deletions.

The server authenticates each device and user, derives tenant scope from trusted server-side enrollment, and rejects mismatched tenant_id values. Tenant scope must not be trusted merely because a client sends it. Local APIs enforce the same boundary as cloud APIs.

Do not infer tenant ownership from array order, names, slugs, email, or browser localStorage. Existing legacy snapshot code contains fallback tenant assignment by row index; it must not be reused as the authoritative migration mapping.

## 4. Local data plane

- PostgreSQL is the authoritative operational database inside a station LAN.
- A versioned local API is the only supported access path for desktop clients.
- The Windows service starts automatically, exposes health/readiness endpoints, and writes structured audit logs.
- LAN transport uses authenticated TLS where feasible; enrollment provisions per-device credentials and rotation/revocation.
- vMix commands execute from the station network and remain available without internet.
- Media files are stored in a managed local media directory with checksums and manifest-based replication; database backups alone do not protect media.

## 5. Cloud synchronization protocol

Use an explicit transactional outbox on every writable side and an inbox/deduplication table on every receiving side.

1. A local transaction changes business data and inserts an outbox mutation in the same database transaction.
2. The sync agent uploads mutations in order per entity/aggregate, retrying safely.
3. Cloud validates device identity, tenant scope, schema version, mutation_id, and authorization before applying.
4. Web-originated changes enter a tenant-scoped cloud command queue.
5. The station agent downloads commands, validates schema and policy, applies them transactionally, then acknowledges them.
6. Acknowledgements and cursors are durable. Retries must be idempotent; no mutation is considered delivered until acknowledged.
7. Sync resumes from durable cursors after process, machine, or internet outages.

Avoid a naive full-database last-write-wins merge. Conflict policy is domain-specific:
- append-only events/audit records: immutable event IDs and deduplication;
- configuration records: optimistic concurrency with explicit conflict state;
- schedules/programs: detect overlapping edits and require a defined winner or operator review;
- deletes: tombstones with retention, not immediate destructive propagation;
- operational vMix commands: commands have expiry, target, and acknowledgement; stale commands must not execute after reconnect.

## 6. Failover and split-brain protection

The standby is a warm replica, not a second active writer. Automatic promotion is allowed only when the system can establish that the primary is fenced (powered off, storage/network lease revoked, or equivalent quorum-backed fencing). If fencing cannot be proven, require an administrator-controlled promotion. Never permit both nodes to accept writes.

Promotion runbook:
1. Detect primary health failure and alert.
2. Attempt recovery/health checks for a bounded interval.
3. Fence the primary or require operator confirmation.
4. Promote standby and update the LAN service endpoint/DNS or virtual IP.
5. Validate database recovery point, API health, tenant identity, and vMix connectivity.
6. Reconnect workstations and resume cloud sync from acknowledged cursors.
7. When the old primary returns, keep it fenced and rebuild it as a replica; never merge two writable database histories automatically.

Expected data loss and recovery time targets must be agreed with each customer and tested. Streaming replication can minimize data loss but does not replace backups.

## 7. Backup and restore policy

Adopt 3-2-1 as a baseline:
- at least three copies;
- at least two independent storage media/devices;
- at least one encrypted off-site copy.

Include PostgreSQL base backups plus WAL/PITR where operationally supported, media directory snapshots with checksums, configuration, encryption-key recovery procedures, and a documented restore test. Define retention and RPO/RTO per customer. Backup success is not accepted until periodic restore tests pass.

## 8. Security and operations

- Separate tenant credentials and device identities.
- Least-privilege roles; no service-role or database superuser secret in desktop renderer code.
- Keep secrets in Windows service credential storage / protected OS facilities, not in frontend bundles.
- Signed updates, staged rollout, rollback, and compatibility checks for database schema.
- Audit log for user, device, tenant, operation, and mutation ID.
- Health dashboard for primary, standby, replication lag, backup age, sync cursor, and failed mutations.
- Remote access uses authenticated outbound sync; do not expose PostgreSQL or unauthenticated LAN ports to the public internet.

## 9. Migration and compatibility strategy

This project must be additive and isolated:
1. Preserve the existing House Mix Web production path and current Lovable Cloud backend.
2. Inventory the live schema, RLS policies, triggers, RPCs, Edge Functions, Storage buckets, auth flows, scheduled jobs, and tenant ownership rules.
3. Obtain and validate a full database export and Storage inventory before any data migration.
4. Build a schema mapping and tenant-integrity report; never infer ownership from row order.
5. Implement local server and API against a disposable test database generated from a verified schema/export.
6. Add a compatibility layer so the current Web app is not rewritten in this first phase.
7. Pilot one radio with a copy of data; compare counts and checksums; test offline operation, reconnect, conflicts, failover, and restore.
8. Only after acceptance, plan a reversible cutover. No production cutover is authorized by this RFC.

Do not pause, delete, reset, migrate, or modify the current Lovable Cloud database as part of this branch.

## 10. Implementation milestones

- M0: inventory current schema, auth, tenant model, storage, functions, and existing local snapshot data.
- M1: define versioned local API contract, tenant/device enrollment, and database migrations for a disposable test environment.
- M2: implement Windows local server service, PostgreSQL lifecycle, health checks, LAN API, and secure enrollment.
- M3: implement workstation client connection and preserve current desktop/web behavior behind a feature flag.
- M4: implement outbox/inbox synchronization, retries, cursors, conflict handling, and media manifests.
- M5: implement standby replication, fencing/promotion runbook, backup/restore automation, and failure drills.
- M6: pilot one radio and obtain explicit acceptance before any production cutover.

## 11. Acceptance criteria

- Core studio workflows work with internet disconnected.
- Multiple LAN workstations see consistent local changes.
- Web changes reach the correct station and are acknowledged.
- Local changes reach Web after reconnect without duplicates.
- Tenant isolation tests prove cross-tenant reads/writes are rejected.
- Simultaneous edits produce a visible conflict, not silent data loss.
- Standby promotion prevents split-brain and passes a documented drill.
- Restore from independent backup is demonstrated.
- Current House Mix Web production remains unchanged throughout the pilot.
