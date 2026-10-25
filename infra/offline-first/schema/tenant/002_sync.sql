-- Per-radio synchronization primitives. Applied inside one radio database
-- after tenant baseline v1, while connected as that database's owner role.
-- Tenant identity is intentionally absent: database isolation is the boundary.

CREATE TABLE IF NOT EXISTS housemix.sync_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  origin_device_id UUID NOT NULL,
  aggregate_type TEXT NOT NULL CHECK (length(trim(aggregate_type)) BETWEEN 1 AND 80),
  aggregate_id TEXT NOT NULL CHECK (length(trim(aggregate_id)) BETWEEN 1 AND 160),
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
  payload JSONB,
  idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  CONSTRAINT sync_outbox_payload_matches_operation
    CHECK ((operation = 'delete' AND payload IS NULL) OR
           (operation = 'upsert' AND payload IS NOT NULL AND jsonb_typeof(payload) = 'object')),
  CONSTRAINT sync_outbox_idempotency_unique UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending
  ON housemix.sync_outbox (created_at, id) WHERE delivered_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sync_outbox_changes
  ON housemix.sync_outbox (created_at, id);

CREATE TABLE IF NOT EXISTS housemix.sync_checkpoints (
  device_id UUID NOT NULL,
  stream_name TEXT NOT NULL CHECK (length(trim(stream_name)) BETWEEN 1 AND 80),
  cursor_value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (device_id, stream_name)
);

CREATE TABLE IF NOT EXISTS housemix.audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_device_id UUID,
  event_type TEXT NOT NULL CHECK (length(trim(event_type)) BETWEEN 1 AND 120),
  entity_type TEXT,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(details) = 'object'),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at
  ON housemix.audit_events (occurred_at DESC);

REVOKE ALL ON ALL TABLES IN SCHEMA housemix FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA housemix FROM PUBLIC;
