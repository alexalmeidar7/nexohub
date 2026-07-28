
CREATE TABLE public.ouvintes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  cpf TEXT,
  telefone TEXT,
  email TEXT,
  setor TEXT,
  cidade TEXT,
  data_nascimento DATE,
  escolaridade TEXT,
  renda TEXT,
  pontuacao NUMERIC DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ouvintes TO authenticated;
GRANT ALL ON public.ouvintes TO service_role;

ALTER TABLE public.ouvintes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own ouvintes"
  ON public.ouvintes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_ouvintes_updated_at
  BEFORE UPDATE ON public.ouvintes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_ouvintes_user_id ON public.ouvintes(user_id);
