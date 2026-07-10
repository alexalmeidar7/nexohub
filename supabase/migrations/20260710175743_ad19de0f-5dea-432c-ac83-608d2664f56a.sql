ALTER TABLE public.empresa_config
  ADD COLUMN IF NOT EXISTS youtube_subs BIGINT,
  ADD COLUMN IF NOT EXISTS instagram_subs BIGINT,
  ADD COLUMN IF NOT EXISTS facebook_subs BIGINT;