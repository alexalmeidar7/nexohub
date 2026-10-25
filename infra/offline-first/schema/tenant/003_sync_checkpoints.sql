-- Durable per-device pull acknowledgement. The issued cursor is server-recorded
-- before it is returned; a device may acknowledge only that exact issued value.
ALTER TABLE housemix.sync_checkpoints
  ADD COLUMN IF NOT EXISTS issued_cursor_value TEXT;

REVOKE ALL ON ALL TABLES IN SCHEMA housemix FROM PUBLIC;
