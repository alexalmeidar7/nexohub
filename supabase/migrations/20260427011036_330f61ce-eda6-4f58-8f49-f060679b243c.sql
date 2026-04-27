
CREATE TABLE public.infomusic (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  artista text NOT NULL,
  musica text NOT NULL,
  curiosidade text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days')
);

CREATE UNIQUE INDEX infomusic_artista_musica_idx 
  ON public.infomusic (lower(artista), lower(musica));

CREATE INDEX infomusic_expires_at_idx ON public.infomusic (expires_at);

ALTER TABLE public.infomusic ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read infomusic"
  ON public.infomusic FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Anyone authenticated can insert infomusic"
  ON public.infomusic FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.cleanup_infomusic()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.infomusic WHERE expires_at < now();
END;
$$;
