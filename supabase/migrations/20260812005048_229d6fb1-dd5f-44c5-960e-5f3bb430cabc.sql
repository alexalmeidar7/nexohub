-- Add 'nome' and 'banner_l_url' to promocoes if they don't exist
ALTER TABLE public.promocoes ADD COLUMN IF NOT EXISTS nome TEXT;
ALTER TABLE public.promocoes ADD COLUMN IF NOT EXISTS banner_l_url TEXT;
