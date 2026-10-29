ALTER TABLE public.programas
  ADD COLUMN IF NOT EXISTS horario_fim text,
  ADD COLUMN IF NOT EXISTS variavel boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_variavel date,
  ADD COLUMN IF NOT EXISTS capa text,
  ADD COLUMN IF NOT EXISTS thumb text,
  ADD COLUMN IF NOT EXISTS descricao text,
  ADD COLUMN IF NOT EXISTS classificacao_etaria text,
  ADD COLUMN IF NOT EXISTS apresentadores_ids uuid[] DEFAULT '{}';
ALTER TABLE public.apresentadores
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS foto text;
