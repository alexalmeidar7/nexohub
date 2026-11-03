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

-- Do not rely on the default PUBLIC function grant: the RPC is exposed through
-- PostgREST, so only signed-in users (scoped by auth.uid()) and trusted jobs
-- may execute it.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

DO $verify$
DECLARE
  function_definition text := pg_get_functiondef(
    'public.has_role(uuid, public.app_role)'::regprocedure
  );
BEGIN
  IF position('auth.uid() = _user_id' IN function_definition) = 0
     OR position('auth.role() = ''service_role''' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'has_role must restrict authenticated checks to auth.uid() and preserve trusted service_role checks';
  END IF;

  IF has_function_privilege('anon', 'public.has_role(uuid, public.app_role)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute has_role';
  END IF;

  IF NOT has_function_privilege('authenticated', 'public.has_role(uuid, public.app_role)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must retain scoped has_role access for RLS policies';
  END IF;

  IF NOT has_function_privilege('service_role', 'public.has_role(uuid, public.app_role)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must retain trusted has_role access';
  END IF;
END
$verify$;
