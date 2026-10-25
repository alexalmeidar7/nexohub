-- Smoke tests for 001_local_control_plane.sql; run against a disposable DB.
BEGIN;
INSERT INTO tenants (id, slug, display_name) VALUES
 ('00000000-0000-4000-8000-000000000001','radio-alpha','Radio Alpha'),
 ('00000000-0000-4000-8000-000000000002','radio-beta','Radio Beta');

INSERT INTO local_devices (id, tenant_id, device_key_hash, label, device_role, status) VALUES
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001', digest('alpha-device-secret','sha256'), 'Alpha principal','primary_server','active'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002', digest('beta-device-secret','sha256'), 'Beta principal','primary_server','active');

INSERT INTO sync_outbox (tenant_id, origin_device_id, aggregate_type, aggregate_id, operation, payload, idempotency_key)
VALUES ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','program','p-1','upsert','{"name":"Programa Alpha"}','alpha-event-1');

DO $$
BEGIN
  IF (SELECT count(*) FROM tenants) <> 2 THEN RAISE EXCEPTION 'Expected two tenants'; END IF;
  IF (SELECT count(*) FROM sync_outbox WHERE tenant_id='00000000-0000-4000-8000-000000000001') <> 1 THEN
    RAISE EXCEPTION 'Expected one Alpha outbox event';
  END IF;
  BEGIN
    INSERT INTO sync_outbox (tenant_id, origin_device_id, aggregate_type, aggregate_id, operation, payload, idempotency_key)
    VALUES ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','program','p-2','upsert','{"name":"cross tenant"}','cross-tenant-should-fail');
    RAISE EXCEPTION 'Cross-tenant device reference unexpectedly succeeded';
  EXCEPTION WHEN foreign_key_violation THEN
    NULL;
  END;
END $$;
ROLLBACK;
