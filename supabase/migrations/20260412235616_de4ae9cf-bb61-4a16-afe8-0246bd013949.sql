
-- 1. Fix music_likes: restrict SELECT to own user
DROP POLICY IF EXISTS "Anyone authenticated can view likes" ON public.music_likes;
CREATE POLICY "Users can view own likes" ON public.music_likes
  FOR SELECT USING (auth.uid() = user_id);

-- 2. Fix xml-files bucket: restrict write to authenticated users
DROP POLICY IF EXISTS "Public insert access for xml files" ON storage.objects;
CREATE POLICY "Authenticated users can upload xml files" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'xml-files');

DROP POLICY IF EXISTS "Public update access for xml files" ON storage.objects;
CREATE POLICY "Authenticated users can update xml files" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'xml-files');

DROP POLICY IF EXISTS "Public delete access for xml files" ON storage.objects;
CREATE POLICY "Authenticated users can delete xml files" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'xml-files');

-- 3. Fix realtime: remove sensitive tables from realtime publication
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'admin_messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.admin_messages;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'user_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.user_settings;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'teleprompters'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.teleprompters;
  END IF;
END $$;
