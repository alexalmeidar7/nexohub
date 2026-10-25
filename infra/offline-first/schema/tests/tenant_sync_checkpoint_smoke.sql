\set ON_ERROR_STOP on
BEGIN;
CREATE SCHEMA IF NOT EXISTS housemix;
CREATE TABLE housemix.sync_checkpoints (
  device_id UUID NOT NULL,
  stream_name TEXT NOT NULL,
  cursor_value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, stream_name)
);
\ir ../tenant/003_sync_checkpoints.sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='housemix' AND table_name='sync_checkpoints'
      AND column_name='issued_cursor_value'
  ) THEN RAISE EXCEPTION 'issued checkpoint column missing'; END IF;
END $$;
ROLLBACK;
