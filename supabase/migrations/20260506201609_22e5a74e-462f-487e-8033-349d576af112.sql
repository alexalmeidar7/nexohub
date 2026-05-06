ALTER TABLE public.comercial_mockups 
ADD COLUMN IF NOT EXISTS config JSONB DEFAULT '{}'::jsonb;