-- Restore the current Bridge contract's default after legacy schema normalization.
-- Idempotent and non-destructive: affects only future inserts that omit status.

ALTER TABLE public.vmix_bridge_jobs
  ALTER COLUMN status SET DEFAULT 'pending';
