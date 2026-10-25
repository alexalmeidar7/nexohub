-- House Mix Offline First: foundational local control-plane schema.
-- Disposable development database only. No production/customer data.
-- Tenant access policies are intentionally NOT declared here: authorization
-- must be enforced by the local API using authenticated identities, not a
-- client-controlled session variable or direct database access.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 160),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_memberships (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  user_subject TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','operator','viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_subject)
);

CREATE TABLE IF NOT EXISTS local_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  device_key_hash BYTEA NOT NULL,
  label TEXT NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 120),
  device_role TEXT NOT NULL CHECK (device_role IN ('primary_server','workstation','standby_server')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','revoked')),
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, id),
  UNIQUE (tenant_id, device_key_hash)
);

CREATE TABLE IF NOT EXISTS sync_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  origin_device_id UUID NOT NULL,
  aggregate_type TEXT NOT NULL CHECK (length(trim(aggregate_type)) BETWEEN 1 AND 80),
  aggregate_id TEXT NOT NULL,
  operation TEXT NOT NULL CHECK (operation IN ('upsert','delete')),
  payload JSONB,
  idempotency_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error TEXT,
  FOREIGN KEY (tenant_id, origin_device_id)
    REFERENCES local_devices(tenant_id, id) ON DELETE RESTRICT,
  UNIQUE (tenant_id, idempotency_key),
  CHECK ((operation = 'delete' AND payload IS NULL) OR operation = 'upsert')
);

CREATE INDEX IF NOT EXISTS idx_sync_outbox_pending
  ON sync_outbox (tenant_id, created_at) WHERE delivered_at IS NULL;

CREATE TABLE IF NOT EXISTS sync_checkpoints (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  device_id UUID NOT NULL,
  stream_name TEXT NOT NULL,
  cursor_value TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, device_id)
    REFERENCES local_devices(tenant_id, id) ON DELETE RESTRICT,
  PRIMARY KEY (tenant_id, device_id, stream_name)
);

CREATE TABLE IF NOT EXISTS local_audit_events (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  actor_subject TEXT,
  device_id UUID,
  event_type TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (tenant_id, device_id)
    REFERENCES local_devices(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_local_audit_tenant_time
  ON local_audit_events (tenant_id, occurred_at DESC);

COMMIT;
