ALTER TABLE public.blitz_promocionais
  ADD COLUMN IF NOT EXISTS horario_fim time without time zone,
  ADD COLUMN IF NOT EXISTS agenda_evento_id uuid;