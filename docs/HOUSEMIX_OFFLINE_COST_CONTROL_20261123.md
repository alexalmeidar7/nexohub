# HMO + HMD — cost-control/offline-first delivery (2026-11-23)

## Verified incident
- Supabase project remained ACTIVE_HEALTHY, but the gateway rejected auth and Realtime with HTTP 402.
- Organization Pro plan hit Egress and Edge Function quotas with Spend Cap enabled.
- In a three-hour sample, gateway showed repeated reads of `/storage/v1/object/list/xml-files`, `/rest/v1/user_settings`, `/rest/v1/programas`, etc.

## Changes in this PR
1. HMO/Desktop Supabase browser client: deduplicate identical in-flight reads and keep an 8-second tenant-and-authorization-scoped cache of selected stable SELECTs, plus 30-second list-cache for `xml-files`. Writes invalidate their corresponding read cache; no auth, RPC, or failed request is cached.
2. HMD: coalesce realtime bursts and change periodic XML refresh from 15s to 60s. Realtime-triggered updates remain immediate; a minute-boundary safety refresh remains.
3. Offline HMD backend: additive local-only account/session schema, scrypt verifiers, device-scoped login/logout endpoints and tests in the isolated local API. These are foundations **not wired into the production Electron UI**.

## Non-negotiable boundaries
- Nothing is automatically migrated or modified in the production Supabase database.
- Do not disable tenant checks, invent Supabase sessions, duplicate raw passwords, or ship service_role keys into Windows clients.
- The local PostgreSQL prototype remains bound to loopback; LAN remains hard-disabled until HTTPS, pairing and network-access tests are complete.
- Offline operation must be verified across login, full module CRUD, multiple stations, crashes, service restart, local backups, and cloud reconciliation before claiming 100% offline.

## Remaining to reach the target architecture
1. Authenticated nightly roster sync by a *single station server* with local-authorization fallback whenever offline; local administrator can revoke immediately. Design and test conflict/revocation rules.
2. Durable local station application data, conflict-safe change journal, bootstrap and Electron renderer integration for all modules.
3. Secure station-local API over HTTPS on a configured LAN IP, station device enrollment and a standby backup.
4. Single upstream writer per radio; idempotent, incremental, backoff-protected HMO/HMD sync with outbound budget limits.
5. Move repeated XML generation and on-air reads to the local station server wherever applicable; reduce external Edge Function polling from vMix/scene viewers.
6. Full end-to-end tests without DNS/Internet and measurable usage reports before production cutover.

## Tests
Run `bunx vitest run src/integrations/supabase/requestBudget.test.ts src/lib/desktopXmlRefresh.test.ts`, `node --check infra/offline-first/api/server.mjs`, and `node --test infra/offline-first/api/tests/local-operator-password.test.mjs`. API+Postgres integration must be run in isolated disposable CI before using customer data.
