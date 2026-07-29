
CREATE TABLE public.cenario_estudio_web (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome text NOT NULL DEFAULT 'Novo cenário web',
  orientation text NOT NULL DEFAULT 'horizontal',
  tv_count integer NOT NULL DEFAULT 1,
  content jsonb NOT NULL DEFAULT '{"gradient":true,"presenter":true,"artist":true,"sponsors":true}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cenario_estudio_web TO authenticated;
GRANT SELECT ON public.cenario_estudio_web TO anon;
GRANT ALL ON public.cenario_estudio_web TO service_role;

ALTER TABLE public.cenario_estudio_web ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage own web scenes"
  ON public.cenario_estudio_web FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Config is non-sensitive layout data; allow public read so vMix browser can consume it.
CREATE POLICY "Public read web scenes"
  ON public.cenario_estudio_web FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE TRIGGER cenario_estudio_web_updated_at
  BEFORE UPDATE ON public.cenario_estudio_web
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
