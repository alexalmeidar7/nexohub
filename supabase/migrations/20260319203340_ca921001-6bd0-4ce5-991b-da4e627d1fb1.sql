
CREATE TABLE public.custom_vmix_buttons (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL DEFAULT '',
  dias_semana TEXT[] DEFAULT '{}',
  horario TEXT DEFAULT '',
  commands JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_vmix_buttons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own custom_vmix_buttons"
  ON public.custom_vmix_buttons
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
