ALTER TABLE public.infomusic_excecoes ADD COLUMN IF NOT EXISTS artista_url TEXT;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.infomusic_excecoes TO authenticated;
GRANT ALL ON public.infomusic_excecoes TO service_role;