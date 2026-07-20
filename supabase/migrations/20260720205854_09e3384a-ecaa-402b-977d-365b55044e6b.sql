
DROP POLICY IF EXISTS "Public can view musicas_tocadas" ON public.musicas_tocadas;
DROP POLICY IF EXISTS "Public can view musicas_tocadas (authenticated)" ON public.musicas_tocadas;

DROP POLICY IF EXISTS "Public read access for xml files" ON storage.objects;
CREATE POLICY "Owner reads xml files"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'xml-files' AND (storage.foldername(name))[1] = (auth.uid())::text);
