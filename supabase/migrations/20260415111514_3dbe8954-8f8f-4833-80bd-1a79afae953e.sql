ALTER TABLE public.quiz_agendados
  ADD COLUMN IF NOT EXISTS explicacao text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS imagem_resposta text NOT NULL DEFAULT '';