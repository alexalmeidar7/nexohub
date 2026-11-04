-- Restore authenticated tenant-scoped writes for InfoMusic.
-- Existing authenticated read behavior is preserved; writes are limited to the
-- station owner returned by current_tenant_user_id() for both owners and sub-users.
-- This migration changes policies only and does not modify or delete data.

DO $migration$
DECLARE
  user_id_type text;
  user_id_nullable text;
  policy_count integer;
BEGIN
  IF to_regclass('public.infomusic') IS NULL THEN
    RAISE EXCEPTION 'public.infomusic is missing; restore the House Mix schema before applying this policy.';
  END IF;

  IF to_regprocedure('public.current_tenant_user_id()') IS NULL THEN
    RAISE EXCEPTION 'public.current_tenant_user_id() is missing; restore tenant ownership before applying this policy.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_class
    WHERE oid='public.infomusic'::regclass AND relrowsecurity
  ) THEN
    RAISE EXCEPTION 'RLS must remain enabled on public.infomusic before tenant write policies are created.';
  END IF;

  SELECT data_type, is_nullable
    INTO user_id_type, user_id_nullable
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='infomusic' AND column_name='user_id';

  IF user_id_type IS DISTINCT FROM 'uuid' OR user_id_nullable IS DISTINCT FROM 'NO' THEN
    RAISE EXCEPTION 'infomusic.user_id must be uuid NOT NULL before tenant write policies are created.';
  END IF;


  EXECUTE 'REVOKE ALL ON TABLE public.infomusic FROM PUBLIC, anon';
  EXECUTE 'REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN ON TABLE public.infomusic FROM authenticated';
  EXECUTE 'GRANT SELECT, INSERT, UPDATE ON TABLE public.infomusic TO authenticated';

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='infomusic' AND policyname='infomusic_tenant_insert'
  ) THEN
    EXECUTE 'CREATE POLICY infomusic_tenant_insert
      ON public.infomusic
      FOR INSERT TO authenticated
      WITH CHECK (user_id = (SELECT public.current_tenant_user_id()))';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='infomusic' AND policyname='infomusic_tenant_update'
  ) THEN
    EXECUTE 'CREATE POLICY infomusic_tenant_update
      ON public.infomusic
      FOR UPDATE TO authenticated
      USING (user_id = (SELECT public.current_tenant_user_id()))
      WITH CHECK (user_id = (SELECT public.current_tenant_user_id()))';
  END IF;

  SELECT count(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname='public' AND tablename='infomusic'
    AND roles = ARRAY['authenticated']::name[]
    AND (
      (policyname='infomusic_tenant_insert' AND cmd='INSERT'
        AND with_check LIKE '%user_id%' AND with_check LIKE '%current_tenant_user_id%')
      OR
      (policyname='infomusic_tenant_update' AND cmd='UPDATE'
        AND qual LIKE '%user_id%' AND qual LIKE '%current_tenant_user_id%'
        AND with_check LIKE '%user_id%' AND with_check LIKE '%current_tenant_user_id%')
    );

  IF policy_count <> 2 THEN
    RAISE EXCEPTION 'Expected exactly two tenant-scoped InfoMusic write policies, found %.', policy_count;
  END IF;

  IF has_table_privilege('anon','public.infomusic','SELECT')
     OR has_table_privilege('anon','public.infomusic','INSERT')
     OR has_table_privilege('anon','public.infomusic','UPDATE')
     OR has_table_privilege('anon','public.infomusic','DELETE')
     OR has_table_privilege('anon','public.infomusic','TRUNCATE')
     OR has_table_privilege('anon','public.infomusic','REFERENCES')
     OR has_table_privilege('anon','public.infomusic','TRIGGER')
     OR has_table_privilege('anon','public.infomusic','MAINTAIN') THEN
    RAISE EXCEPTION 'anon must have no table privileges on public.infomusic.';
  END IF;

  IF NOT has_table_privilege('authenticated','public.infomusic','SELECT')
     OR NOT has_table_privilege('authenticated','public.infomusic','INSERT')
     OR NOT has_table_privilege('authenticated','public.infomusic','UPDATE')
     OR has_table_privilege('authenticated','public.infomusic','DELETE')
     OR has_table_privilege('authenticated','public.infomusic','TRUNCATE')
     OR has_table_privilege('authenticated','public.infomusic','REFERENCES')
     OR has_table_privilege('authenticated','public.infomusic','TRIGGER')
     OR has_table_privilege('authenticated','public.infomusic','MAINTAIN') THEN
    RAISE EXCEPTION 'authenticated must retain only SELECT, INSERT, and UPDATE on public.infomusic.';
  END IF;

  IF NOT has_table_privilege('service_role','public.infomusic','SELECT')
     OR NOT has_table_privilege('service_role','public.infomusic','INSERT')
     OR NOT has_table_privilege('service_role','public.infomusic','UPDATE')
     OR NOT has_table_privilege('service_role','public.infomusic','DELETE') THEN
    RAISE EXCEPTION 'service_role must retain InfoMusic read/write/cleanup privileges.';
  END IF;
END
$migration$;
