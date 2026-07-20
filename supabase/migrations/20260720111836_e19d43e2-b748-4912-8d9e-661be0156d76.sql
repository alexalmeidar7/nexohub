GRANT SELECT ON public.musicas_tocadas TO anon;
CREATE POLICY "Public can view musicas_tocadas" ON public.musicas_tocadas FOR SELECT TO anon USING (true);