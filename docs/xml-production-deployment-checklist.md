# XML production deployment checklist

This runbook is intentionally separate from pull-request CI: a successful build does not deploy database migrations, Edge Functions, or Storage assets.

## Automated deployment

Run the GitHub Actions workflow **Deploy and validate XML production stack** manually from the `main` branch after merging this PR. The workflow is pinned to the production project ref `qazvgmgdidjhbvcuinpy`, requires typing that exact ref, and uses the `production` GitHub Environment as an approval boundary.

Required GitHub Actions secrets:
- `SUPABASE_PROJECT_REF`: must equal `qazvgmgdidjhbvcuinpy`.
- `SUPABASE_ACCESS_TOKEN`: Supabase personal access token authorized for the project.
- `SUPABASE_DB_PASSWORD`: database password for the production project.

The workflow applies pending migrations first, then deploys the 11 XML/weather Edge Functions. It does not run automatically on push.

## Known production data dependency: legacy Storage assets

The active project's Storage was inspected during the XML audit and had no buckets or objects at that time. The previous Supabase project containing legacy logos, presenter photos, covers, and other station media was not available in the connected Supabase account. Do not rewrite legacy asset URLs to the new project or claim the feeds are fully verified until those objects are copied and the URLs are checked.

To complete this final dependency, grant access to the source Supabase project or provide a Storage export/backup. Copy the original objects while preserving paths, then verify representative public URLs for each feed and station.

## Completion criteria

- Migration workflow completes successfully and migration history includes the XML bucket and weather cron migrations.
- All 11 Edge Functions are deployed to the production project.
- XML endpoints return valid XML for each relevant station and expected query identifier.
- Referenced logos/photos/covers return HTTP 200 and display in vMix.
- Weather XML cron runs successfully.
- No cross-station data is returned when UUID and slug conflict.

A green GitHub build alone is not evidence that these production checks passed.
