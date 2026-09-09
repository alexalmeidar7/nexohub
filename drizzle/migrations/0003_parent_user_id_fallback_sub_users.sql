CREATE OR REPLACE FUNCTION public.current_parent_user_id()
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select coalesce(
    (select nullif(u.raw_user_meta_data ->> 'parent_user_id', '')::uuid
       from auth.users u
      where u.id = auth.uid()),
    (select s.parent_user_id
       from public.sub_users s
      where s.auth_user_id = auth.uid()
        and s.ativo = true
      limit 1)
  )
$function$;