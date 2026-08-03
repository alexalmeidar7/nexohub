
CREATE POLICY "Users can manage their own exceptions"
ON public.infomusic_excecoes
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
