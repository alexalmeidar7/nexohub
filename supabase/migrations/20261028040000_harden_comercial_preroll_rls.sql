-- Restore the intended tenant and public-player access model for comercial_preroll.
-- The restored project currently has this table exposed to anon/authenticated with
-- broad table privileges and RLS disabled. Keep public playback read-only and active-only.

BEGIN;

ALTER TABLE public.comercial_preroll ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.comercial_preroll FROM PUBLIC, anon, authenticated;
-- Anonymous player reads use public-player-data, which resolves a station slug
-- before querying with the service role. Do not expose this table directly to anon.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.comercial_preroll TO authenticated;

DROP POLICY IF EXISTS "Users manage own comercial_preroll" ON public.comercial_preroll;
CREATE POLICY "Users manage own comercial_preroll"
  ON public.comercial_preroll
  FOR ALL
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

-- Remove the legacy broad active-row policy. Public player reads go through
-- public-player-data, which scopes campaigns to the requested station slug.
DROP POLICY IF EXISTS "Anyone authenticated can view active prerolls" ON public.comercial_preroll;

DROP POLICY IF EXISTS "Sub-users can view parent comercial_preroll" ON public.comercial_preroll;
CREATE POLICY "Sub-users can view parent comercial_preroll"
  ON public.comercial_preroll
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sub_users
      WHERE sub_users.auth_user_id = (SELECT auth.uid())
        AND sub_users.parent_user_id = comercial_preroll.user_id
        AND sub_users.ativo = true
    )
  );

DROP POLICY IF EXISTS "Sub-users can insert parent comercial_preroll" ON public.comercial_preroll;
CREATE POLICY "Sub-users can insert parent comercial_preroll"
  ON public.comercial_preroll
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sub_users
      WHERE sub_users.auth_user_id = (SELECT auth.uid())
        AND sub_users.parent_user_id = comercial_preroll.user_id
        AND sub_users.ativo = true
    )
  );

DROP POLICY IF EXISTS "Sub-users can update parent comercial_preroll" ON public.comercial_preroll;
CREATE POLICY "Sub-users can update parent comercial_preroll"
  ON public.comercial_preroll
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sub_users
      WHERE sub_users.auth_user_id = (SELECT auth.uid())
        AND sub_users.parent_user_id = comercial_preroll.user_id
        AND sub_users.ativo = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.sub_users
      WHERE sub_users.auth_user_id = (SELECT auth.uid())
        AND sub_users.parent_user_id = comercial_preroll.user_id
        AND sub_users.ativo = true
    )
  );

DROP POLICY IF EXISTS "Sub-users can delete parent comercial_preroll" ON public.comercial_preroll;
CREATE POLICY "Sub-users can delete parent comercial_preroll"
  ON public.comercial_preroll
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.sub_users
      WHERE sub_users.auth_user_id = (SELECT auth.uid())
        AND sub_users.parent_user_id = comercial_preroll.user_id
        AND sub_users.ativo = true
    )
  );

DO $verify$
DECLARE
  rls_enabled boolean;
  policy_count integer;
BEGIN
  SELECT c.relrowsecurity
    INTO rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'comercial_preroll';

  IF rls_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'RLS is not enabled on public.comercial_preroll.';
  END IF;

  SELECT count(*)
    INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'comercial_preroll'
    AND policyname IN (
      'Users manage own comercial_preroll',
      'Sub-users can view parent comercial_preroll',
      'Sub-users can insert parent comercial_preroll',
      'Sub-users can update parent comercial_preroll',
      'Sub-users can delete parent comercial_preroll'
    );

  IF policy_count <> 5 THEN
    RAISE EXCEPTION 'Expected six comercial_preroll policies, found %.', policy_count;
  END IF;

  IF has_table_privilege('anon', 'public.comercial_preroll', 'SELECT')
     OR has_table_privilege('anon', 'public.comercial_preroll', 'INSERT')
     OR has_table_privilege('anon', 'public.comercial_preroll', 'UPDATE')
     OR has_table_privilege('anon', 'public.comercial_preroll', 'DELETE')
     OR has_table_privilege('anon', 'public.comercial_preroll', 'TRUNCATE') THEN
    RAISE EXCEPTION 'anon still has write or truncate privileges on comercial_preroll.';
  END IF;

  IF NOT has_table_privilege('authenticated', 'public.comercial_preroll', 'SELECT')
     OR NOT has_table_privilege('authenticated', 'public.comercial_preroll', 'INSERT')
     OR NOT has_table_privilege('authenticated', 'public.comercial_preroll', 'UPDATE')
     OR NOT has_table_privilege('authenticated', 'public.comercial_preroll', 'DELETE')
     OR has_table_privilege('authenticated', 'public.comercial_preroll', 'TRUNCATE') THEN
    RAISE EXCEPTION 'comercial_preroll table privileges do not match the expected least-privilege grants.';
  END IF;
END
$verify$;

COMMIT;
