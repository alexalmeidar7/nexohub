ALTER TABLE public.empresa_config
  ADD COLUMN IF NOT EXISTS audio_sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS video_sources jsonb NOT NULL DEFAULT '[]'::jsonb;