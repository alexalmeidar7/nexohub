ALTER TABLE public.comercial_preroll
  ADD COLUMN IF NOT EXISTS ads_cliente text,
  ADD COLUMN IF NOT EXISTS ads_canais text[] DEFAULT '{}'::text[];