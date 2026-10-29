-- Create the public XML bucket required by the live weather/XML feeds.
-- Writes remain service-role-only; public=true enables read access for public feed assets.
INSERT INTO storage.buckets (id, name, public)
VALUES ('xml-files', 'xml-files', true)
ON CONFLICT (id) DO UPDATE
SET public = true;
