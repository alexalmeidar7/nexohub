
CREATE TABLE public.broadcast_assuntos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  programa_id UUID NOT NULL,
  mensagens JSONB NOT NULL DEFAULT '[]'::jsonb,
  font_family TEXT NOT NULL DEFAULT 'Inter',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, programa_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcast_assuntos TO authenticated;
GRANT SELECT ON public.broadcast_assuntos TO anon;
GRANT ALL ON public.broadcast_assuntos TO service_role;

ALTER TABLE public.broadcast_assuntos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages assuntos"
  ON public.broadcast_assuntos
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Public read assuntos"
  ON public.broadcast_assuntos
  FOR SELECT
  TO anon
  USING (true);

CREATE TRIGGER update_broadcast_assuntos_updated_at
  BEFORE UPDATE ON public.broadcast_assuntos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
