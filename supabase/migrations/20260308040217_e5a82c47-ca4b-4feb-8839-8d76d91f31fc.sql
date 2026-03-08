CREATE POLICY "Anyone authenticated can view active channels"
ON public.streaming_channels FOR SELECT
TO authenticated
USING (active = true);