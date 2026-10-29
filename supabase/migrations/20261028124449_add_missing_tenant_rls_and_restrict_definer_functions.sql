DO $$
DECLARE t record;
BEGIN
 FOR t IN
  SELECT c.table_name
  FROM information_schema.columns c
  JOIN pg_class pc ON pc.relname=c.table_name
  JOIN pg_namespace pn ON pn.oid=pc.relnamespace AND pn.nspname='public'
  WHERE c.table_schema='public' AND c.column_name='user_id'
    AND pc.relkind='r'
    AND NOT EXISTS (SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.table_name)
 LOOP
  EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (user_id = (SELECT public.current_tenant_user_id())) WITH CHECK (user_id = (SELECT public.current_tenant_user_id()))',
    'tenant_isolation_'||t.table_name,t.table_name);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.current_parent_user_id() FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.current_tenant_user_id() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_parent_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_tenant_user_id() TO authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM anon, authenticated, PUBLIC;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM anon;
