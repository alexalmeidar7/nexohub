ALTER TABLE public.sorteio_sorteios
  ADD COLUMN IF NOT EXISTS programa_id uuid,
  ADD COLUMN IF NOT EXISTS programa_nome text,
  ADD COLUMN IF NOT EXISTS apresentador_nome text;