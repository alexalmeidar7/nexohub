CREATE TABLE public.blitz_promocionais_historico (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  blitz_id uuid,
  cliente text,
  acao text NOT NULL,
  motivo text,
  dados_antes jsonb,
  dados_depois jsonb,
  changed_by uuid,
  changed_by_email text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_blitz_hist_user_created ON public.blitz_promocionais_historico (user_id, created_at DESC);
CREATE INDEX idx_blitz_hist_blitz ON public.blitz_promocionais_historico (blitz_id);

GRANT SELECT, INSERT ON public.blitz_promocionais_historico TO authenticated;
GRANT ALL ON public.blitz_promocionais_historico TO service_role;

ALTER TABLE public.blitz_promocionais_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner can view blitz history"
  ON public.blitz_promocionais_historico
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Owner can insert blitz history"
  ON public.blitz_promocionais_historico
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);