DROP POLICY IF EXISTS "entregas_owner_read" ON storage.objects;
CREATE POLICY "entregas_owner_read" ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'entregas'
  AND (storage.foldername(name))[1] IN (auth.uid()::text, public.current_parent_user_id()::text)
);