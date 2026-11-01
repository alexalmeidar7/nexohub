-- Keep SECURITY DEFINER to avoid recursive RLS evaluation, but prevent
-- authenticated callers from probing another user's role membership.
-- Existing RLS policies pass auth.uid(), so their authorization behavior is unchanged.
-- Trusted service_role calls may still inspect another user's role when needed.

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN auth.role() = 'service_role' THEN EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = _role
    )
    WHEN auth.uid() IS NOT NULL AND auth.uid() = _user_id THEN EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role = _role
    )
    ELSE false
  END
$function$;
