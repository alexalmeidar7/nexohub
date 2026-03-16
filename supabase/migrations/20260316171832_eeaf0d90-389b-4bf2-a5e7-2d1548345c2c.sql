ALTER TABLE public.streaming_channels 
  ADD COLUMN IF NOT EXISTS horario_inicio text DEFAULT '',
  ADD COLUMN IF NOT EXISTS horario_fim text DEFAULT '',
  ADD COLUMN IF NOT EXISTS descricao text DEFAULT '';