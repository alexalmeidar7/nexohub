-- Durable inbox for authenticated remote mutations. Applying business data
-- is a separate, domain-specific transaction and is intentionally not done here.
CREATE TABLE IF NOT EXISTS housemix.sync_inbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mutation_id UUID NOT NULL UNIQUE,
  received_by_device_id UUID NOT NULL,
  source TEXT NOT NULL CHECK (length(trim(source)) BETWEEN 1 AND 40),
  aggregate_type TEXT NOT NULL CHECK (length(trim(aggregate_type)) BETWEEN 1 AND 80),
  aggregate_id TEXT NOT NULL CHECK (length(trim(aggregate_id)) BETWEEN 1 AND 160),
  operation TEXT NOT NULL CHECK (operation IN ('upsert', 'delete')),
  payload JSONB,
  base_version BIGINT CHECK (base_version IS NULL OR base_version >= 0),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'conflict', 'rejected')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  CONSTRAINT sync_inbox_payload_matches_operation
    CHECK ((operation = 'delete' AND payload IS NULL) OR
           (operation = 'upsert' AND payload IS NOT NULL AND jsonb_typeof(payload) = 'object'))
);
CREATE INDEX IF NOT EXISTS idx_sync_inbox_pending
  ON housemix.sync_inbox (received_at, id) WHERE status = 'pending';
REVOKE ALL ON housemix.sync_inbox FROM PUBLIC;
