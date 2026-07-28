
CREATE TABLE public.batalhas_agendadas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  artista1_nome TEXT NOT NULL DEFAULT '',
  artista1_musica TEXT NOT NULL DEFAULT '',
  artista1_porcentagem INTEGER NOT NULL DEFAULT 0,
  artista1_imagem TEXT NOT NULL DEFAULT '',
  artista2_nome TEXT NOT NULL DEFAULT '',
  artista2_musica TEXT NOT NULL DEFAULT '',
  artista2_porcentagem INTEGER NOT NULL DEFAULT 0,
  artista2_imagem TEXT NOT NULL DEFAULT '',
  data_batalha DATE NOT NULL,
  horario_inicio TEXT NOT NULL,
  horario_fim TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.batalhas_agendadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own batalhas_agendadas"
  ON public.batalhas_agendadas
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_batalhas_agendadas_updated_at
  BEFORE UPDATE ON public.batalhas_agendadas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
