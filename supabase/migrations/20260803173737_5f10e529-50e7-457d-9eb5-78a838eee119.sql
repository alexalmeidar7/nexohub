CREATE POLICY "Admins can view all musicas_tocadas"
ON public.musicas_tocadas
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));