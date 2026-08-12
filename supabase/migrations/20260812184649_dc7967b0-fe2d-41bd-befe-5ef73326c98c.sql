DROP POLICY IF EXISTS "public read tv_pairing_codes" ON public.tv_pairing_codes;
REVOKE SELECT ON public.tv_pairing_codes FROM anon;
REVOKE SELECT ON public.tv_pairing_codes FROM authenticated;

DROP POLICY IF EXISTS "Public can read active blitz of the day" ON public.blitz_promocionais;
REVOKE SELECT ON public.blitz_promocionais FROM anon;