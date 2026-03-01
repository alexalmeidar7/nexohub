
-- Table to store music likes (one like per song per session/fingerprint)
CREATE TABLE public.music_likes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  titulo text NOT NULL,
  artista text NOT NULL,
  capa text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid NOT NULL
);

-- Enable RLS
ALTER TABLE public.music_likes ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can insert likes
CREATE POLICY "Users can insert likes"
ON public.music_likes
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can view own likes
CREATE POLICY "Users can view own likes"
ON public.music_likes
FOR SELECT
USING (auth.uid() = user_id);

-- Users can delete own likes (unlike)
CREATE POLICY "Users can delete own likes"
ON public.music_likes
FOR DELETE
USING (auth.uid() = user_id);

-- Index for aggregation queries
CREATE INDEX idx_music_likes_song ON public.music_likes (artista, titulo);
CREATE INDEX idx_music_likes_user ON public.music_likes (user_id);
