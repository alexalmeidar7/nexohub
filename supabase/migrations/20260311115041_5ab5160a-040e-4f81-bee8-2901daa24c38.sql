
CREATE TABLE public.roteiros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  programa_nome TEXT NOT NULL DEFAULT '',
  estudio TEXT NOT NULL DEFAULT '',
  tipo_programa TEXT NOT NULL DEFAULT '',
  data_programa DATE NOT NULL DEFAULT CURRENT_DATE,
  horario TEXT NOT NULL DEFAULT '',
  titulo TEXT NOT NULL DEFAULT '',
  subtitulo TEXT NOT NULL DEFAULT '',
  conteudo_html TEXT NOT NULL DEFAULT '',
  participantes JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'rascunho',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.roteiros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own roteiros"
  ON public.roteiros
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
