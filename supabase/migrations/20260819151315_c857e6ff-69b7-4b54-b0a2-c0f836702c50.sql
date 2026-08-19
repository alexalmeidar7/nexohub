ALTER TABLE public.apresentadores ADD COLUMN IF NOT EXISTS background_url TEXT;

-- Grant access (good practice to ensure it's up to date)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.apresentadores TO authenticated;
GRANT ALL ON public.apresentadores TO service_role;
GRANT SELECT ON public.apresentadores TO anon;
