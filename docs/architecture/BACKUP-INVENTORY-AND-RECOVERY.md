# Backup inventory and offline-first recovery findings

Date of analysis: 2026-10-25
Files analyzed from the user-provided conversation attachments:
- `supabase_database_dump.txt` (24,564,880 bytes)
- `supabase_local_db.txt` (12,314,674 bytes)

Both files parse successfully as JSON. Both report the same export timestamp: `2026-09-09T18:40:15.464Z`. These are historical exports, not proof of the current production state.

## 1. Structural comparison

Both files contain:
- 77 table keys under `tables`.
- 415 rows total across those top-level table arrays.
- The same five station entries (slugs: `positiva`, `interativa`, `jornal`, `cultura`, `alex`).
- The same top-level table data: all 77 table arrays compare equal between the two files.
- The same Storage bucket inventory.

The dump file also declares `totalTables: 77` and has an `edgePayloads` section. The local DB file has an additional station-scoped `tables` payload. Its only populated station-scoped arrays are:
- `promocoes`: 11 rows
- `testemunhais`: 7 rows

All 18 station-scoped rows are duplicates of rows already present in the top-level table arrays (matched by record ID). They must not be imported twice.

## 2. Populated top-level tables

| Table | Rows |
|---|---:|
| `apresentadores` | 162 |
| `comercial_preroll` | 6 |
| `empresa_config` | 4 |
| `logos_patrocinadores` | 98 |
| `player_chat_messages` | 40 |
| `programas` | 74 |
| `promocoes` | 12 |
| `shopping_products` | 3 |
| `streaming_channels` | 8 |
| `testemunhais` | 8 |
| **Total** | **415** |

The row count is not a measure of completeness. The exports contain 77 table keys but only 10 non-empty top-level tables. Empty arrays may be genuine empty tables, filtered export results, or a limitation of the export; the files alone cannot distinguish these cases.

## 3. Storage inventory

Two buckets are present: `empresa-assets` and `comercial`.

The metadata inventory contains:
- `empresa-assets`: 98 object entries across root and five station-scoped prefixes.
- `comercial`: 12 object entries across root and five station-scoped prefixes.
- **110 object entries total**.

These are Storage object listings/metadata, not the binary contents of the images, audio, or other files. The exports therefore do not constitute a complete Storage backup. Some metadata fields (such as object IDs, timestamps, and metadata) are null in the listing. A separate object download and checksum process is required.

## 4. Station-scoped payloads and tenant boundaries

The exports identify five station slugs, but this does not establish that all 415 records are correctly partitioned or that each station's data is complete. The local file's 18 station-scoped rows belong to the same record IDs already present in top-level arrays.

Before import, generate a table-by-table ownership report from record fields and the actual foreign-key relationships. Do not assume a station slug, user ID, or storage prefix alone is sufficient proof of tenant ownership. Quarantine orphaned or ambiguous records for review.

## 5. Safe recovery decision

These two files are useful historical recovery inputs, but **must not be used as the sole production restore source**.

Required next actions:
1. Preserve original files and record SHA-256 hashes.
2. Obtain a fresh database export from the authoritative production database when it becomes accessible.
3. Export schema, constraints, indexes, triggers, functions, policies, and auth relationships separately.
4. Download every object in both Storage buckets and verify object counts and SHA-256 checksums against a fresh listing.
5. Compare the fresh export with these 2026-09-09 snapshots; report inserted, changed, missing, orphaned, and duplicate rows.
6. Build and test the import in a disposable local PostgreSQL instance only. No writes to production.
7. Keep the existing House Mix Web deployment and backend unchanged until offline-first parity and rollback tests pass.

## 6. Integrity hashes

The following hashes are computed from the exact attached files and allow the originals to be identified:

- `supabase_database_dump.txt`: `SHA256_PENDING`
- `supabase_local_db.txt`: `SHA256_PENDING`

Replace the placeholders with the measured SHA-256 values before treating this document as a final evidence manifest.
