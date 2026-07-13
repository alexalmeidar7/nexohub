
CREATE TABLE public.audiencia_historico (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  programa TEXT,
  audio INTEGER NOT NULL DEFAULT 0,
  video INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_audiencia_historico_user_created ON public.audiencia_historico (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.audiencia_historico TO authenticated;
GRANT ALL ON public.audiencia_historico TO service_role;

ALTER TABLE public.audiencia_historico ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own audiencia_historico"
  ON public.audiencia_historico FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
