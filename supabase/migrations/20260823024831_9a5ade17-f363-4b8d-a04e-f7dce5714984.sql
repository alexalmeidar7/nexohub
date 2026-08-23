revoke execute on function public.current_parent_user_id() from public;
revoke execute on function public.current_parent_user_id() from anon;
grant execute on function public.current_parent_user_id() to authenticated, service_role;