ALTER TABLE public.comercial_preroll
  ADD COLUMN IF NOT EXISTS media_type text NOT NULL DEFAULT 'video',
  ADD COLUMN IF NOT EXISTS youtube_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS data_inicial date DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS data_final date;