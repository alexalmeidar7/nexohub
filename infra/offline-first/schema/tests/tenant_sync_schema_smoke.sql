\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA IF NOT EXISTS housemix;
\ir ../tenant/002_sync.sql

DO $$
DECLARE
  outbox_columns INTEGER;
  checkpoint_columns INTEGER;
  audit_columns INTEGER;
BEGIN
  SELECT count(*) INTO outbox_columns
  FROM information_schema.columns
  WHERE table_schema = 'housemix' AND table_name = 'sync_outbox'
    AND column_name IN ('id','origin_device_id','aggregate_type','aggregate_id','operation','payload','idempotency_key','created_at');
  IF outbox_columns <> 8 THEN RAISE EXCEPTION 'sync_outbox schema incomplete'; END IF;

  SELECT count(*) INTO checkpoint_columns
  FROM information_schema.columns
  WHERE table_schema = 'housemix' AND table_name = 'sync_checkpoints'
    AND column_name IN ('device_id','stream_name','cursor_value','updated_at');
  IF checkpoint_columns <> 4 THEN RAISE EXCEPTION 'sync_checkpoints schema incomplete'; END IF;

  SELECT count(*) INTO audit_columns
  FROM information_schema.columns
  WHERE table_schema = 'housemix' AND table_name = 'audit_events'
    AND column_name IN ('id','actor_device_id','event_type','entity_type','entity_id','details','occurred_at');
  IF audit_columns <> 7 THEN RAISE EXCEPTION 'audit_events schema incomplete'; END IF;
END $$;

DO $$
BEGIN
  BEGIN
    INSERT INTO housemix.sync_outbox (origin_device_id, aggregate_type, aggregate_id, operation, payload, idempotency_key)
    VALUES (gen_random_uuid(), 'program', 'p-1', 'delete', '{"invalid":true}', 'invalid-delete-payload');
    RAISE EXCEPTION 'delete payload constraint was not enforced';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO housemix.sync_outbox (origin_device_id, aggregate_type, aggregate_id, operation, payload, idempotency_key)
    VALUES (gen_random_uuid(), 'program', 'p-2', 'upsert', '[]', 'invalid-upsert-payload');
    RAISE EXCEPTION 'upsert object constraint was not enforced';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
ROLLBACK;
