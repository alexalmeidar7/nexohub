# Tenant data mapping — historical export review

Analysis date: 2026-10-25
Source: attached `supabase_database_dump.txt`, exported at `2026-09-09T18:40:15.464Z`.
Scope: data-shape review only. This is not a live production ownership or RLS audit.

## 1. Critical finding: not every table carries tenant ownership

Of the 10 non-empty tables in the export, only 7 contain a direct `user_id` column. Three populated tables do not:
- `apresentadores` — 162 rows
- `programas` — 74 rows
- `player_chat_messages` — 40 rows

These tables cannot safely be partitioned by tenant from the exported row fields alone. `programas` has presenter references, but a presenter relation is not proof of tenant ownership until the foreign keys and uniqueness rules are verified. Chat messages have a `channel_id`; the owning station must be derived only after resolving the channel relationship.

## 2. Direct user ownership found in populated tables

| Table | Rows | User ID groups in export |
|---|---:|---|
| `comercial_preroll` | 6 | 3 user IDs, including 2 not in the five-station registry |
| `empresa_config` | 4 | 4 IDs; one of the five registered stations has no row |
| `logos_patrocinadores` | 98 | 3 registered station IDs |
| `promocoes` | 12 | 2 registered station IDs |
| `shopping_products` | 3 | 3 IDs, including 2 not in the five-station registry |
| `streaming_channels` | 8 | 3 registered station IDs |
| `testemunhais` | 8 | 2 registered station IDs |

The two IDs outside the five-station registry appear in both `comercial_preroll` and `shopping_products`. Their identity and authorization context are unknown from these files. Treat these rows as **unresolved ownership**, not as belonging to a known customer.

## 3. Station registry vs. data coverage

The export lists five station slugs: `positiva`, `interativa`, `jornal`, `cultura`, and `alex`.

The populated `empresa_config` rows cover four station IDs, not all five. Several tables have data for only a subset of registered stations. This can be legitimate, but it means row counts cannot be interpreted as proof that all five customers' data was fully exported.

No customer mapping should be inferred from brand names embedded in free-text fields, product names, URLs, or media paths.

## 4. Safe tenant mapping rules

- Preserve `user_id` as the legacy authenticated-user identifier; do not silently redefine it as tenant ID.
- Create an explicit station/tenant registry and membership mapping in the new architecture.
- Resolve `programas` and `apresentadores` through verified relationship constraints and application semantics.
- Resolve `player_chat_messages.channel_id` through the actual channel table and verify that each channel maps to exactly one tenant.
- Quarantine the two unknown owner IDs and any orphaned/ambiguous references pending authoritative confirmation.
- Do not import or expose unresolved records in any tenant's local database.
- Do not infer ownership from email, station display name, URL prefix, or file path.

## 5. Next technical action

Obtain a fresh authoritative export (schema + data + policies + Storage inventory) when the Cloud database is available. Then join the relevant tables using actual foreign keys and produce a row-level ownership report. Only rows with a verified tenant mapping may enter a tenant-specific local database.

No production changes or database writes were made as part of this review.
