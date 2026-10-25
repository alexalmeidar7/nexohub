-- One-time, tenant-bound enrollment grants for the isolated Offline First prototype.
-- Apply only to the disposable local PostgreSQL database.
BEGIN;

CREATE TABLE IF NOT EXISTS device_enrollment_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  token_hash BYTEA NOT NULL UNIQUE,
  device_role TEXT NOT NULL CHECK (device_role IN ('primary_server','workstation','standby_server')),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  consumed_device_id UUID,
  revoked_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, consumed_device_id)
    REFERENCES local_devices(tenant_id, id) ON DELETE RESTRICT,
  CHECK ((consumed_at IS NULL AND consumed_device_id IS NULL) OR
         (consumed_at IS NOT NULL AND consumed_device_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_device_enrollment_tokens_tenant_expiry
  ON device_enrollment_tokens (tenant_id, expires_at)
  WHERE consumed_at IS NULL AND revoked_at IS NULL;

COMMIT;
