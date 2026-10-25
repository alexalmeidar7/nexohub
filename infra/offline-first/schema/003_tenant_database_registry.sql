-- Control-plane mapping from each radio tenant to its dedicated data database.
-- This records intended ownership only; it does not create or connect to databases.
BEGIN;

CREATE TABLE IF NOT EXISTS tenant_database_registry (
  tenant_id UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE RESTRICT,
  database_key TEXT NOT NULL UNIQUE
    CHECK (database_key ~ '^hm_[a-f0-9]{32}$'),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','provisioning','active','failed','suspended')),
  schema_version INTEGER NOT NULL DEFAULT 0 CHECK (schema_version >= 0),
  provision_attempts INTEGER NOT NULL DEFAULT 0 CHECK (provision_attempts >= 0),
  last_error_code TEXT
    CHECK (last_error_code IS NULL OR last_error_code ~ '^[a-z0-9_]{1,80}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  CHECK ((status = 'active' AND activated_at IS NOT NULL) OR status <> 'active')
);

CREATE INDEX IF NOT EXISTS idx_tenant_database_registry_status
  ON tenant_database_registry (status, updated_at);

COMMIT;
