ALTER TABLE public.broadcast_assuntos
  ADD COLUMN IF NOT EXISTS bg_color text NOT NULL DEFAULT '#ffffff',
  ADD COLUMN IF NOT EXISTS text_color text NOT NULL DEFAULT '#000000';