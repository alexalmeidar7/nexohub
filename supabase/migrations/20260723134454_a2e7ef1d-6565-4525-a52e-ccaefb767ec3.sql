
CREATE TABLE public.sorteio_premio_programas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  premio_id UUID NOT NULL REFERENCES public.sorteio_premios(id) ON DELETE CASCADE,
  programa_id UUID NOT NULL REFERENCES public.programas(id) ON DELETE CASCADE,
  quantidade INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(premio_id, programa_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sorteio_premio_programas TO authenticated;
GRANT ALL ON public.sorteio_premio_programas TO service_role;
GRANT SELECT ON public.sorteio_premio_programas TO anon;
ALTER TABLE public.sorteio_premio_programas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own premio_programas" ON public.sorteio_premio_programas FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Public read premio_programas" ON public.sorteio_premio_programas FOR SELECT USING (true);
