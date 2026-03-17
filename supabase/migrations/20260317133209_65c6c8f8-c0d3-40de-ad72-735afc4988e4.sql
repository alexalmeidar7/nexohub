
ALTER TABLE public.comercial_preroll 
  ADD COLUMN IF NOT EXISTS nome text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS views_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS clicks_count integer NOT NULL DEFAULT 0;
