\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA IF NOT EXISTS housemix;
CREATE TABLE housemix.sync_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mutation_id UUID NOT NULL UNIQUE,
  received_by_device_id UUID NOT NULL,
  source TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  payload JSONB,
  base_version BIGINT,
  schema_version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
\ir ../tenant/004_sync_inbox.sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables
    WHERE table_schema='housemix' AND table_name='sync_inbox') THEN
    RAISE EXCEPTION 'tenant sync inbox table missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes
    WHERE schemaname='housemix' AND indexname='idx_sync_inbox_pending') THEN
    RAISE EXCEPTION 'tenant sync inbox pending index missing';
  END IF;
END $$;
ROLLBACK;
