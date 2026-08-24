ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS infomusic_excecoes_capa_url text,
  ADD COLUMN IF NOT EXISTS infomusic_excecoes_artista_url text;