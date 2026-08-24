DROP POLICY IF EXISTS "Public read comercial" ON storage.objects;

CREATE POLICY "Public read comercial media" ON storage.objects
FOR SELECT USING (
  bucket_id = 'comercial'
  AND (storage.foldername(name))[2] IN ('logos','banners','sorteios','chatbot-campaigns','preroll','mockups')
);

CREATE POLICY "Owners read comercial" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'comercial'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[1] = (public.current_parent_user_id())::text
  )
);

CREATE POLICY "Owners read comercial privado" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'comercial-privado'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[1] = (public.current_parent_user_id())::text
  )
);

CREATE POLICY "Owners insert comercial privado" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'comercial-privado'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[1] = (public.current_parent_user_id())::text
  )
);

CREATE POLICY "Owners update comercial privado" ON storage.objects
FOR UPDATE TO authenticated USING (
  bucket_id = 'comercial-privado'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[1] = (public.current_parent_user_id())::text
  )
) WITH CHECK (
  bucket_id = 'comercial-privado'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[1] = (public.current_parent_user_id())::text
  )
);

CREATE POLICY "Owners delete comercial privado" ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'comercial-privado'
  AND (
    (storage.foldername(name))[1] = auth.uid()::text
    OR (storage.foldername(name))[1] = (public.current_parent_user_id())::text
  )
);