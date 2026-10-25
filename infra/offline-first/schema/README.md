# Local control-plane schema

Apply only to the disposable PostgreSQL instance described in this folder:

```powershell
Get-Content .\schema\001_local_control_plane.sql | docker compose exec -T housemix-local-postgres psql -U housemix_dev -d housemix_local
```

This creates the first control-plane primitives: tenants, memberships, device identity, an outbound synchronization queue, per-device checkpoints, and audit events.

## Important boundaries

- This is a development scaffold, not a production-ready authorization system.
- Do not connect the current Web application or customer devices to this database.
- Do not restore the historical JSON/SQL exports into this schema.
- The application must authenticate users and devices through a trusted local API. Database credentials must never be shipped to browser clients or workstations.
- Tenant isolation must be enforced at the API and database layers before importing any real tenant records. This migration deliberately does not add permissive RLS policies or pretend a client-set session variable is trustworthy.
- Sync conflict resolution, deletion tombstones, schema versioning, encryption, retention, backup restore drills, and standby failover remain separate design/test milestones.
