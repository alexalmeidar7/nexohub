CREATE POLICY "Authenticated can view shared roteiros"
ON public.roteiros
FOR SELECT
TO authenticated
USING (share_token IS NOT NULL);

CREATE POLICY "Authenticated can update shared roteiros"
ON public.roteiros
FOR UPDATE
TO authenticated
USING (share_token IS NOT NULL)
WITH CHECK (share_token IS NOT NULL);