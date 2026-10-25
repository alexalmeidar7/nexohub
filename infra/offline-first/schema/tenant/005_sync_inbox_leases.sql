-- Recoverable inbox processing leases. A lease is a temporary claim, not
-- proof that the business mutation was applied.
ALTER TABLE housemix.sync_inbox
  ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 0
    CHECK (attempt_count >= 0),
  ADD COLUMN IF NOT EXISTS available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS lease_token UUID,
  ADD COLUMN IF NOT EXISTS lease_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error_code TEXT;

ALTER TABLE housemix.sync_inbox
  DROP CONSTRAINT IF EXISTS sync_inbox_status_check;
ALTER TABLE housemix.sync_inbox
  ADD CONSTRAINT sync_inbox_status_check
  CHECK (status IN ('pending', 'processing', 'applied', 'conflict', 'rejected'));

ALTER TABLE housemix.sync_inbox
  ADD CONSTRAINT sync_inbox_lease_consistency
  CHECK ((status = 'processing' AND lease_token IS NOT NULL AND lease_until IS NOT NULL)
      OR (status <> 'processing' AND lease_token IS NULL AND lease_until IS NULL));

CREATE INDEX IF NOT EXISTS idx_sync_inbox_claimable
  ON housemix.sync_inbox (available_at, received_at, id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_sync_inbox_expired_leases
  ON housemix.sync_inbox (lease_until)
  WHERE status = 'processing';
