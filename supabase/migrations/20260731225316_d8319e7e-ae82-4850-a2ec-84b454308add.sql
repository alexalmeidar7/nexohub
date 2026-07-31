GRANT SELECT ON public.blitz_promocionais TO anon;
CREATE POLICY "Public can read active blitz of the day"
ON public.blitz_promocionais
FOR SELECT
TO anon, authenticated
USING (
  realizada = false
  AND dia >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
);