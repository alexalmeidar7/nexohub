-- Replace weak POSITION() ownership checks with strict folder-prefix checks
-- matching the pattern already used by the "cenario-estudio" bucket.

DROP POLICY IF EXISTS "Auth users upload comercial" ON storage.objects;
CREATE POLICY "Auth users upload comercial"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'comercial'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

DROP POLICY IF EXISTS "Authenticated users can upload empresa assets" ON storage.objects;
CREATE POLICY "Authenticated users can upload empresa assets"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'empresa-assets'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

DROP POLICY IF EXISTS "Authenticated users can upload xml files" ON storage.objects;
CREATE POLICY "Authenticated users can upload xml files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'xml-files'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

DROP POLICY IF EXISTS "Users can upload preroll videos" ON storage.objects;
CREATE POLICY "Users can upload preroll videos"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'preroll'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);

DROP POLICY IF EXISTS "Users can upload shopping images" ON storage.objects;
CREATE POLICY "Users can upload shopping images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'shopping'
  AND (storage.foldername(name))[1] = (auth.uid())::text
);