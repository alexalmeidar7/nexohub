-- Ensure programa_ids column exists and has proper default
ALTER TABLE public.testemunhais ADD COLUMN IF NOT EXISTS programa_ids uuid[] DEFAULT '{}';

-- Fix existing nulls if any (safety check)
UPDATE public.testemunhais SET programa_ids = '{}' WHERE programa_ids IS NULL;
