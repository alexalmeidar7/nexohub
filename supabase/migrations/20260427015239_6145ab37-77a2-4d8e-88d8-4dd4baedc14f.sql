-- Remove old shared rows to avoid cross-user leakage
DELETE FROM public.infomusic;

-- Add user_id ownership column
ALTER TABLE public.infomusic
  ADD COLUMN user_id uuid NOT NULL;

-- Drop any existing uniqueness on (artista, musica) global pair, recreate per-user
DO $$
DECLARE
  idx record;
BEGIN
  FOR idx IN
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public' AND tablename = 'infomusic'
      AND indexname <> 'infomusic_pkey'
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS public.%I', idx.indexname);
  END LOOP;
END $$;

CREATE UNIQUE INDEX infomusic_user_artista_musica_idx
  ON public.infomusic (user_id, lower(artista), lower(musica));

CREATE INDEX infomusic_expires_at_idx ON public.infomusic (expires_at);

-- Ensure RLS is enabled
ALTER TABLE public.infomusic ENABLE ROW LEVEL SECURITY;

-- Drop any pre-existing policies
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='infomusic' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.infomusic', p.policyname);
  END LOOP;
END $$;

-- Per-user policies
CREATE POLICY "Users can view their own curiosidades"
  ON public.infomusic FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own curiosidades"
  ON public.infomusic FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own curiosidades"
  ON public.infomusic FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own curiosidades"
  ON public.infomusic FOR DELETE
  USING (auth.uid() = user_id);