CREATE TABLE public.music_likes_youtube_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  artista TEXT NOT NULL,
  titulo TEXT NOT NULL,
  video_id TEXT NOT NULL,
  thumbnail TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, artista, titulo)
);

ALTER TABLE public.music_likes_youtube_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own youtube cache"
ON public.music_likes_youtube_cache
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own youtube cache"
ON public.music_likes_youtube_cache
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own youtube cache"
ON public.music_likes_youtube_cache
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own youtube cache"
ON public.music_likes_youtube_cache
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);