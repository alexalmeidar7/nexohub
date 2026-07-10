
-- Tighten INSERT policies on storage buckets so authenticated users can only
-- upload objects whose path contains their own auth.uid(). This prevents any
-- authenticated user from writing into another tenant's folder while keeping
-- all existing upload paths (which already embed the uploader's uid) working.

-- comercial
DROP POLICY IF EXISTS "Auth users upload comercial" ON storage.objects;
CREATE POLICY "Auth users upload comercial"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'comercial'
  AND position((auth.uid())::text in name) > 0
);

-- empresa-assets
DROP POLICY IF EXISTS "Authenticated users can upload empresa assets" ON storage.objects;
CREATE POLICY "Authenticated users can upload empresa assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'empresa-assets'
  AND position((auth.uid())::text in name) > 0
);

-- preroll
DROP POLICY IF EXISTS "Users can upload preroll videos" ON storage.objects;
CREATE POLICY "Users can upload preroll videos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'preroll'
  AND position((auth.uid())::text in name) > 0
);

-- shopping
DROP POLICY IF EXISTS "Users can upload shopping images" ON storage.objects;
CREATE POLICY "Users can upload shopping images"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'shopping'
  AND position((auth.uid())::text in name) > 0
);

-- xml-files
DROP POLICY IF EXISTS "Authenticated users can upload xml files" ON storage.objects;
CREATE POLICY "Authenticated users can upload xml files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'xml-files'
  AND position((auth.uid())::text in name) > 0
);
