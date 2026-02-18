
-- Add ativo column to programas
ALTER TABLE public.programas ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;

-- Add prioridade column to agenda_eventos
ALTER TABLE public.agenda_eventos ADD COLUMN IF NOT EXISTS prioridade text NOT NULL DEFAULT 'normal';
