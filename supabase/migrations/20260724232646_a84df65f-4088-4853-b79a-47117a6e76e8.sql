
ALTER TABLE public.ouvintes
  ADD COLUMN IF NOT EXISTS banido boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS banido_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS banido_motivo text;

CREATE INDEX IF NOT EXISTS idx_ouvintes_banido ON public.ouvintes (user_id, banido) WHERE banido = true;

CREATE OR REPLACE FUNCTION public.is_ouvinte_banido(_radio_user_id uuid, _identifier text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.ouvintes
     WHERE user_id = _radio_user_id
       AND banido = true
       AND _identifier IS NOT NULL
       AND length(trim(_identifier)) > 0
       AND (
         email = _identifier
         OR cpf = _identifier
         OR telefone = _identifier
         OR regexp_replace(coalesce(telefone,''),'\D','','g') = regexp_replace(_identifier,'\D','','g')
       )
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_ouvinte_banido(uuid, text) TO anon, authenticated, service_role;
