-- Applied separately inside each newly provisioned radio database.
-- Executed only after SET ROLE to that tenant's NOLOGIN owner role.
CREATE SCHEMA IF NOT EXISTS housemix AUTHORIZATION CURRENT_USER;

CREATE TABLE IF NOT EXISTS housemix.schema_migrations (
  version INTEGER PRIMARY KEY CHECK (version > 0),
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  checksum_sha256 CHAR(64) NOT NULL CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA housemix TO PUBLIC;
