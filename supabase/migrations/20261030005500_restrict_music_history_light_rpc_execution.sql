-- The public XML Edge Function calls this RPC with service_role.
-- Direct PostgREST execution by anonymous or authenticated clients is not required.
-- Keep the SECURITY DEFINER function callable only by the trusted server role.
REVOKE ALL ON FUNCTION public.get_music_history_light(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_music_history_light(uuid, integer) TO service_role;
