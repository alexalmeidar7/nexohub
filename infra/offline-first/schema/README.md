# Local control-plane schema

Apply only to the disposable PostgreSQL instance described in this folder, in order:

```powershell
Get-Content .\schema\001_local_control_plane.sql | docker compose exec -T housemix-local-postgres psql -U housemix_dev -d housemix_local
Get-Content .\schema\002_one_time_device_enrollment.sql | docker compose exec -T housemix-local-postgres psql -U housemix_dev -d housemix_local
```

Migration 001 creates tenants, memberships, device identity, sync outbox, checkpoints, and audit events. Migration 002 adds expiring, tenant-bound, single-use device enrollment grants. Only a SHA-256 hash of each high-entropy grant token is stored.

## Important boundaries

- Development scaffold only; not a production-ready authorization system.
- Do not connect the current Web application or customer devices to this database.
- Do not restore historical JSON/SQL exports into this schema.
- Database credentials must never be shipped to browser clients or workstations.
- Enrollment tokens are issued locally by an operator script, expire, and can be revoked; there is no remote admin identity/UI yet.
- Tenant isolation is enforced by the trusted local API and composite foreign keys; this is not a substitute for a complete security review.
- Sync conflict resolution, deletion tombstones, schema versioning, encryption, retention, backup restore drills, and standby failover remain separate milestones.
