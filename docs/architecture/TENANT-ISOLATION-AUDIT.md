# Tenant isolation — schema audit (code-derived)

Date: 2026-10-24
Source: `src/integrations/supabase/types.ts` on main at `434816ce00ed15e68bf449e40fd0dae1cdb7dd2d`
Purpose: identify the work required before tenant-separated local databases and synchronization. This is not a live database/RLS audit.

## 1. Results

The generated TypeScript database type contains 81 tables.

- 71 table Row definitions include a `user_id` column.
- 10 do not include a direct `user_id` column:
  - `admin_messages`
  - `available_modules`
  - `comercial_mockups`
  - `planos`
  - `player_chat_messages`
  - `player_heartbeats`
  - `player_listener_profiles`
  - `sub_users`
  - `tv_pairing_codes`
  - `tv_pairing_events`

Some of these have alternative ownership-like fields (e.g. `parent_user_id`, `auth_user_id`, `master_user_id`, `paired_user_id`, `slug_user_id`) or may be global catalog/configuration tables. Their semantics must be confirmed from SQL constraints, policies, server code, and live data.

**Important:** `user_id` is not automatically equivalent to a tenant/station ID. The current schema appears user-centric in many places. The future tenant boundary must be explicit and validated against actual customer ownership. Do not mass-rename `user_id` or infer tenant from a user email, name, slug, or array position.

## 2. Tables requiring special ownership review

- Global or plan/catalog candidates: `available_modules`, `planos`.
- Message/audience/player entities: `admin_messages`, `player_chat_messages`, `player_heartbeats`, `player_listener_profiles`.
- Sub-user relationship: `sub_users` uses `auth_user_id` and `parent_user_id`.
- TV pairing: `tv_pairing_codes`, `tv_pairing_events` use pairing/slug-related fields.
- Commercial mockups: `comercial_mockups` requires inspection of references and authorization logic.

These are review candidates, not conclusions about whether they are shared or tenant-owned.

## 3. Tenant model proposal

Before sync implementation, define a canonical station registry and membership relation in the isolated local/cloud design:

- `tenant_id`: immutable station/customer UUID.
- `user_id`: authenticated person; retain its current meaning.
- `device_id`: enrolled workstation/server identity.
- `tenant_memberships`: maps users to tenant(s) and role(s).
- `tenant_resources`: optional mapping for legacy records whose owner cannot be safely inferred.
- `mutation_id`: idempotency key for sync.
- `origin_device_id`, `base_version`, `version`: conflict and origin tracking.

A migration mapping must be generated from explicit current relationships and checked by a human. Ambiguous or orphaned rows go to quarantine; never auto-assign them to the first user or first station.

## 4. Data sources not yet validated

Two repository files were found by path and Git blob SHA:
- `src/data/supabase_local_db.json` — blob SHA `198caa3f2023805ee44a2c213819b1a598320904`.
- `src/data/supabase_database_dump.json` — blob SHA `bcf418164f949a689bb5632450e4f10274b684f8`.

Their Git tree sizes are approximately 12.3 MB and 24.5 MB respectively. The GitHub file-content connector returned empty content for these oversized files and the raw-file endpoint rejected them as too large. Therefore their JSON structure, row counts, timestamps, completeness, tenant ownership, and restore validity remain **unverified**. They must not be described as verified backups.

To validate them, obtain the files as actual downloads (or upload them into the working conversation) and run offline JSON parsing, table/row counts, null/duplicate primary-key checks, relationship checks, timestamp inspection, and SHA-256 checks. Compare with a fresh, authoritative database export when the Cloud becomes accessible.

## 5. Next required audit against actual database

1. Export current schema and data from the actual source without changing it.
2. Enumerate all schemas, tables, views, columns, PKs, FKs, unique constraints, indexes, triggers, functions, extensions, and sequences.
3. Export RLS enabled/forced flags and every policy expression.
4. Inventory Auth users, roles, memberships, and account relationships without copying passwords or secrets.
5. Inventory Storage buckets, object keys, metadata, policies, and object counts; download and checksum every object.
6. Compare the live database with the 258 SQL migration files and the generated TypeScript types.
7. Produce a tenant ownership matrix with counts of owned, shared, orphaned, and ambiguous records.
8. Only after review, create local schema migrations in a disposable test database.

## 6. Guardrails

- No production DB writes or schema changes in this audit.
- No changes to Lovable Cloud billing, pause/resume, or deployment.
- No cutover, restore, or import based only on repository JSON files.
- Do not copy client-embedded credentials into the Desktop server. Replace the legacy credential mechanism and rotate exposed credentials before release.
- Do not expose privileged backend keys in the Electron renderer or workstation clients.
