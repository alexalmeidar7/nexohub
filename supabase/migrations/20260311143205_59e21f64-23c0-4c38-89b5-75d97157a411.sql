
CREATE TABLE public.teleprompters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  estudio TEXT NOT NULL DEFAULT '',
  nome TEXT NOT NULL DEFAULT '',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.teleprompters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own teleprompters"
  ON public.teleprompters
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
