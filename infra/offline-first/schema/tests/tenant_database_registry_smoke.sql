-- Smoke tests for the per-radio database registry migration.
-- Run after migrations 001, 002 and 003 against a disposable database.
BEGIN;

INSERT INTO tenants (id, slug, display_name) VALUES
 ('00000000-0000-4000-8000-000000000011','registry-alpha','Registry Alpha'),
 ('00000000-0000-4000-8000-000000000012','registry-beta','Registry Beta');

INSERT INTO tenant_database_registry (tenant_id, database_key, status)
VALUES
 ('00000000-0000-4000-8000-000000000011','hm_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','pending'),
 ('00000000-0000-4000-8000-000000000012','hm_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','pending');

DO $$
BEGIN
  IF (SELECT count(*) FROM tenant_database_registry
      WHERE tenant_id IN ('00000000-0000-4000-8000-000000000011',
                          '00000000-0000-4000-8000-000000000012')) <> 2 THEN
    RAISE EXCEPTION 'Expected one dedicated database mapping per tenant';
  END IF;

  BEGIN
    INSERT INTO tenant_database_registry (tenant_id, database_key, status)
    VALUES ('00000000-0000-4000-8000-000000000011','hm_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','pending');
    RAISE EXCEPTION 'Duplicate database key unexpectedly succeeded';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO tenant_database_registry (tenant_id, database_key, status)
    VALUES ('00000000-0000-4000-8000-000000000011','customer_supplied_db_name','pending');
    RAISE EXCEPTION 'Untrusted database identifier unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    UPDATE tenant_database_registry SET status='active'
    WHERE tenant_id='00000000-0000-4000-8000-000000000011';
    RAISE EXCEPTION 'Activation without activated_at unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END $$;

ROLLBACK;
