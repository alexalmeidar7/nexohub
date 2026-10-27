-- Reconcile the current main Bridge baseline with the queue expiry contract.
-- Additive and idempotent: preserve all existing Bridge rows and timestamps.
-- Existing jobs receive an expiry derived from their creation time; future jobs
-- use the same 30-second TTL already expected by the Bridge claim function.

ALTER TABLE public.vmix_bridge_jobs
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

UPDATE public.vmix_bridge_jobs
SET expires_at = created_at + interval '30 seconds'
WHERE expires_at IS NULL;

ALTER TABLE public.vmix_bridge_jobs
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '30 seconds');

ALTER TABLE public.vmix_bridge_jobs
  ALTER COLUMN expires_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS vmix_bridge_jobs_expiry_idx
  ON public.vmix_bridge_jobs (device_id, expires_at)
  WHERE status = 'pending';
