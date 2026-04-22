ALTER TABLE public.agenda_eventos
  ADD COLUMN IF NOT EXISTS youtube_titulo text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS youtube_descricao text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS edicao_notas text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS edicao_concluida boolean NOT NULL DEFAULT false;