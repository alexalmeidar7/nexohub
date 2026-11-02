-- Tighten exposed SECURITY DEFINER RPCs without breaking tenant RLS or XML generation.
-- has_role remains callable by authenticated users for RLS policies, but only for
-- their own auth.uid(); trusted service-role jobs may still check another user.
-- Music history is consumed by the serve-xml-geral Edge Function using service_role.

BEGIN;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND auth.uid() <> _user_id THEN false
    ELSE EXISTS (
      SELECT 1
      FROM public.user_roles
      WHERE user_id = _user_id
        AND role = _role
    )
  END;
$function$;

REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_music_history_light(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_music_history_light(uuid, integer) TO service_role;

DO $verify$
BEGIN
  IF has_function_privilege('anon', 'public.has_role(uuid, public.app_role)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute has_role';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.has_role(uuid, public.app_role)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must retain has_role for RLS policies';
  END IF;
  IF has_function_privilege('anon', 'public.get_music_history_light(uuid, integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_music_history_light(uuid, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_music_history_light must not be exposed to browser roles';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.get_music_history_light(uuid, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must retain XML music-history access';
  END IF;
END
$verify$;

COMMIT;
