ALTER TABLE public.promocoes ADD COLUMN IF NOT EXISTS programa_ids uuid[] DEFAULT '{}';
UPDATE public.promocoes SET programa_ids = '{}' WHERE programa_ids IS NULL;
GRANT ALL ON public.promocoes TO authenticated;
GRANT ALL ON public.promocoes TO service_role;
GRANT SELECT ON public.promocoes TO anon;