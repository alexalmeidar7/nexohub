
CREATE OR REPLACE FUNCTION public.current_parent_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.parent_user_id
  FROM public.sub_users s
  WHERE s.auth_user_id = auth.uid()
    AND s.ativo = true
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_tenant_user_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.current_parent_user_id(), auth.uid())
$$;

REVOKE ALL ON FUNCTION public.current_parent_user_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_tenant_user_id() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_parent_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_tenant_user_id() TO authenticated;

DO $$
DECLARE
  p record;
  using_expr text;
  check_expr text;
  stmt text;
BEGIN
  FOR p IN
    SELECT pol.schemaname, pol.tablename, pol.policyname, pol.qual, pol.with_check
    FROM pg_policies pol
    JOIN information_schema.columns c
      ON c.table_schema = pol.schemaname
     AND c.table_name = pol.tablename
     AND c.column_name = 'user_id'
    WHERE pol.schemaname = 'public'
      AND pol.tablename NOT IN ('profiles','user_roles','sub_users')
      AND (coalesce(pol.qual,'') LIKE '%auth.uid()%' OR coalesce(pol.with_check,'') LIKE '%auth.uid()%')
      AND pol.policyname NOT LIKE 'Public %'
  LOOP
    using_expr := CASE WHEN p.qual IS NULL THEN NULL
      ELSE replace(p.qual, 'auth.uid()', 'public.current_tenant_user_id()') END;
    check_expr := CASE WHEN p.with_check IS NULL THEN NULL
      ELSE replace(p.with_check, 'auth.uid()', 'public.current_tenant_user_id()') END;
    stmt := format('ALTER POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
    IF using_expr IS NOT NULL THEN
      stmt := stmt || format(' USING (%s)', using_expr);
    END IF;
    IF check_expr IS NOT NULL THEN
      stmt := stmt || format(' WITH CHECK (%s)', check_expr);
    END IF;
    EXECUTE stmt;
  END LOOP;
END $$;
