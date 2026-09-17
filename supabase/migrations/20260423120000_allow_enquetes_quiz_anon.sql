-- Allow anon access to enquetes_agendadas and quiz_agendados for station authentication
DROP POLICY IF EXISTS "Anon can select enquetes_agendadas" ON public.enquetes_agendadas;
DROP POLICY IF EXISTS "Anon can insert enquetes_agendadas" ON public.enquetes_agendadas;
DROP POLICY IF EXISTS "Anon can update enquetes_agendadas" ON public.enquetes_agendadas;
DROP POLICY IF EXISTS "Anon can delete enquetes_agendadas" ON public.enquetes_agendadas;

CREATE POLICY "Anon can select enquetes_agendadas" ON public.enquetes_agendadas
  FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can insert enquetes_agendadas" ON public.enquetes_agendadas
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon can update enquetes_agendadas" ON public.enquetes_agendadas
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon can delete enquetes_agendadas" ON public.enquetes_agendadas
  FOR DELETE TO anon USING (true);

DROP POLICY IF EXISTS "Anon can select quiz_agendados" ON public.quiz_agendados;
DROP POLICY IF EXISTS "Anon can insert quiz_agendados" ON public.quiz_agendados;
DROP POLICY IF EXISTS "Anon can update quiz_agendados" ON public.quiz_agendados;
DROP POLICY IF EXISTS "Anon can delete quiz_agendados" ON public.quiz_agendados;

CREATE POLICY "Anon can select quiz_agendados" ON public.quiz_agendados
  FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can insert quiz_agendados" ON public.quiz_agendados
  FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon can update quiz_agendados" ON public.quiz_agendados
  FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon can delete quiz_agendados" ON public.quiz_agendados
  FOR DELETE TO anon USING (true);
