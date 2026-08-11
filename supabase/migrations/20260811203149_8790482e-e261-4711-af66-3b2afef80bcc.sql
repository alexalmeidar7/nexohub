ALTER TABLE public.testemunhais ADD COLUMN IF NOT EXISTS programa_ids uuid[] DEFAULT '{}';
