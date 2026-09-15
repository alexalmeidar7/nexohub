DROP POLICY IF EXISTS "Public read comercial media" ON storage.objects;
CREATE POLICY "Public read comercial media" ON storage.objects FOR SELECT
USING (bucket_id = 'comercial' AND (storage.foldername(name))[2] = ANY (ARRAY['logos','banners','sorteios','chatbot-campaigns','preroll','mockups','promos','promos_l']));