
-- Allow all authenticated users to count likes (for global counter)
DROP POLICY "Users can view own likes" ON public.music_likes;

CREATE POLICY "Anyone authenticated can view likes"
ON public.music_likes
FOR SELECT
USING (true);
