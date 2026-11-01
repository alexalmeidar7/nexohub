# Recovered migration source statements

These 14 SQL files were reconstructed from the applied `supabase_migrations.schema_migrations.statements` records in the verified House Mix backend project `qazvgmgdidjhbvcuinpy` on 2026-10-28/29.

Each ledger record contains exactly one non-empty executed SQL statement. The files preserve that statement text; they are not claimed to reproduce the original files' byte-for-byte formatting or comments.

Safety notes:
- This commit only restores source text to the PR branch. It does not execute SQL or change the database.
- The Bridge backend workflow must continue to verify that all 14 versions are already recorded on the confirmed target before any Bridge write.
- The recovered statements contain schema/RLS definitions and function definitions. One statement defines a chat-cleanup function whose body deletes messages older than 24 hours when that function is invoked; the migration itself does not invoke it.
- One statement replaces four tenant policies using `DROP POLICY IF EXISTS` followed by explicit recreation. It does not drop tables or columns.
- Do not replay these historical statements against a fresh or partially restored database. Use the reviewed, separately gated additive reconciliation migrations for the active QAZ project.

## Superseded Bridge migration archive

The early prototype `20261016090000_create_vmix_bridge.sql` is preserved at
`docs/superseded-migrations/20261016090000_create_vmix_bridge.sql.txt` for
historical reference only. It is intentionally outside the active migrations
directory because its `queued/completed/expired` status contract and legacy
device columns are incompatible with the current Bridge schema. Do not replay
it. The active baseline is `20261022185000_vmix_bridge_backend.sql`.
