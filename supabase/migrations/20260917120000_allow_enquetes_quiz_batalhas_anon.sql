-- Permite acesso total de leitura e escrita (anônimo e autenticado)
-- para as tabelas de interatividade vMix (enquetes, quiz, batalhas musicais).
-- Isto permite que emissoras com autenticação customizada salvem e atualizem dados
-- sem serem bloqueadas pelo RLS.

-- 1. ENQUETES AGENDADAS
ALTER TABLE public.enquetes_agendadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon can select enquetes_agendadas" ON public.enquetes_agendadas;
DROP POLICY IF EXISTS "Anon can insert enquetes_agendadas" ON public.enquetes_agendadas;
DROP POLICY IF EXISTS "Anon can update enquetes_agendadas" ON public.enquetes_agendadas;
DROP POLICY IF EXISTS "Anon can delete enquetes_agendadas" ON public.enquetes_agendadas;
DROP POLICY IF EXISTS "Users manage own enquetes_agendadas" ON public.enquetes_agendadas;
DROP POLICY IF EXISTS "Allow all on enquetes_agendadas" ON public.enquetes_agendadas;

CREATE POLICY "Allow all on enquetes_agendadas" ON public.enquetes_agendadas
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.enquetes_agendadas TO anon, authenticated, service_role;

-- 2. QUIZ AGENDADOS
ALTER TABLE public.quiz_agendados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon can select quiz_agendados" ON public.quiz_agendados;
DROP POLICY IF EXISTS "Anon can insert quiz_agendados" ON public.quiz_agendados;
DROP POLICY IF EXISTS "Anon can update quiz_agendados" ON public.quiz_agendados;
DROP POLICY IF EXISTS "Anon can delete quiz_agendados" ON public.quiz_agendados;
DROP POLICY IF EXISTS "Users manage own quiz_agendados" ON public.quiz_agendados;
DROP POLICY IF EXISTS "Allow all on quiz_agendados" ON public.quiz_agendados;

CREATE POLICY "Allow all on quiz_agendados" ON public.quiz_agendados
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.quiz_agendados TO anon, authenticated, service_role;

-- 3. BATALHAS AGENDADAS
ALTER TABLE public.batalhas_agendadas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon can select batalhas_agendadas" ON public.batalhas_agendadas;
DROP POLICY IF EXISTS "Anon can insert batalhas_agendadas" ON public.batalhas_agendadas;
DROP POLICY IF EXISTS "Anon can update batalhas_agendadas" ON public.batalhas_agendadas;
DROP POLICY IF EXISTS "Anon can delete batalhas_agendadas" ON public.batalhas_agendadas;
DROP POLICY IF EXISTS "Users manage own batalhas_agendadas" ON public.batalhas_agendadas;
DROP POLICY IF EXISTS "Allow all on batalhas_agendadas" ON public.batalhas_agendadas;

CREATE POLICY "Allow all on batalhas_agendadas" ON public.batalhas_agendadas
  FOR ALL
  TO public
  USING (true)
  WITH CHECK (true);

GRANT ALL ON public.batalhas_agendadas TO anon, authenticated, service_role;
