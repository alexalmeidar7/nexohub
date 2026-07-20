GRANT SELECT ON public.musicas_tocadas TO authenticated;

DROP POLICY IF EXISTS "Public can view musicas_tocadas (authenticated)" ON public.musicas_tocadas;
CREATE POLICY "Public can view musicas_tocadas (authenticated)"
  ON public.musicas_tocadas
  FOR SELECT
  TO authenticated
  USING (true);