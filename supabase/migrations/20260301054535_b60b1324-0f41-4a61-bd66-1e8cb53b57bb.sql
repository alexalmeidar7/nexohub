
ALTER TABLE public.shopping_products
ADD COLUMN IF NOT EXISTS description text DEFAULT '',
ADD COLUMN IF NOT EXISTS payment_url text DEFAULT '';
