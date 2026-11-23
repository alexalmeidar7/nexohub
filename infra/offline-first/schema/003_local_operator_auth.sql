-- Additive, disposable local-control-plane migration (NOT Supabase production).
-- Local login is independent of internet availability after trusted provisioning.
BEGIN;
CREATE TABLE IF NOT EXISTS local_operator_accounts (
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE RESTRICT,
  user_subject TEXT NOT NULL CHECK (length(user_subject) BETWEEN 1 AND 160),
  email TEXT NOT NULL CHECK (email = lower(trim(email)) AND length(email) BETWEEN 4 AND 254),
  password_verifier TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','operator','viewer')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  last_validated_online TIMESTAMPTZ,
  failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, user_subject),
  UNIQUE (tenant_id, email)
);
CREATE TABLE IF NOT EXISTS local_operator_sessions (
  tenant_id UUID NOT NULL,
  session_hash BYTEA NOT NULL,
  user_subject TEXT NOT NULL,
  device_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, session_hash),
  FOREIGN KEY (tenant_id, user_subject)
    REFERENCES local_operator_accounts (tenant_id, user_subject) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, device_id)
    REFERENCES local_devices (tenant_id, id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_local_operator_sessions_device
  ON local_operator_sessions (tenant_id, device_id, expires_at) WHERE revoked_at IS NULL;
COMMIT;
