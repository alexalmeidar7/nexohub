
CREATE TABLE public.enquetes_agendadas (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  pergunta text NOT NULL DEFAULT '',
  resposta1 text NOT NULL DEFAULT '',
  resposta2 text NOT NULL DEFAULT '',
  resposta3 text NOT NULL DEFAULT '',
  resposta4 text NOT NULL DEFAULT '',
  resposta_correta integer NOT NULL DEFAULT 1,
  data_enquete date NOT NULL,
  horario_inicio text NOT NULL,
  horario_fim text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.enquetes_agendadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own enquetes_agendadas"
  ON public.enquetes_agendadas
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_enquetes_agendadas_updated_at
  BEFORE UPDATE ON public.enquetes_agendadas
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
