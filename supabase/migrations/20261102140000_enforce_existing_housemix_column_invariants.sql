-- Reconcile existing House Mix columns when ADD COLUMN IF NOT EXISTS skipped
-- columns that were already present with weaker nullability/defaults.
-- This migration never deletes, reassigns, or silently backfills existing rows.
-- It fails closed if existing data cannot satisfy the reviewed ownership/integrity rules.

DO $migration$
DECLARE
  dashboard_type text;
  dashboard_default text;
  timezone_type text;
  timezone_default text;
  infomusic_user_type text;
  infomusic_fk_definition text;
  orphan_owners bigint;
BEGIN
  SELECT data_type, column_default
    INTO dashboard_type, dashboard_default
  FROM information_schema.columns
  WHERE table_schema='public'
    AND table_name='user_settings'
    AND column_name='dashboard_items';

  IF dashboard_type IS NULL THEN
    ALTER TABLE public.user_settings
      ADD COLUMN dashboard_items jsonb NOT NULL DEFAULT '[]'::jsonb;
  ELSIF dashboard_type <> 'jsonb' THEN
    RAISE EXCEPTION 'user_settings.dashboard_items has incompatible type %.', dashboard_type;
  ELSE
    IF EXISTS (SELECT 1 FROM public.user_settings WHERE dashboard_items IS NULL) THEN
      RAISE EXCEPTION 'user_settings.dashboard_items contains NULL rows. Review them before enforcing NOT NULL; no values were changed.';
    END IF;
    ALTER TABLE public.user_settings
      ALTER COLUMN dashboard_items SET DEFAULT '[]'::jsonb;
    ALTER TABLE public.user_settings
      ALTER COLUMN dashboard_items SET NOT NULL;
  END IF;

  SELECT data_type, column_default
    INTO timezone_type, timezone_default
  FROM information_schema.columns
  WHERE table_schema='public'
    AND table_name='empresa_config'
    AND column_name='timezone';

  IF timezone_type IS NULL THEN
    ALTER TABLE public.empresa_config
      ADD COLUMN timezone text NOT NULL DEFAULT 'America/Sao_Paulo';
  ELSIF timezone_type <> 'text' THEN
    RAISE EXCEPTION 'empresa_config.timezone has incompatible type %.', timezone_type;
  ELSE
    IF EXISTS (SELECT 1 FROM public.empresa_config WHERE timezone IS NULL) THEN
      RAISE EXCEPTION 'empresa_config.timezone contains NULL rows. Review them before enforcing NOT NULL; no values were changed.';
    END IF;
    ALTER TABLE public.empresa_config
      ALTER COLUMN timezone SET DEFAULT 'America/Sao_Paulo';
    ALTER TABLE public.empresa_config
      ALTER COLUMN timezone SET NOT NULL;
  END IF;

  ALTER TABLE public.infomusic_excecoes
    ADD COLUMN IF NOT EXISTS artista_url text;

  ALTER TABLE public.infomusic
    ADD COLUMN IF NOT EXISTS user_id uuid;

  SELECT data_type
    INTO infomusic_user_type
  FROM information_schema.columns
  WHERE table_schema='public'
    AND table_name='infomusic'
    AND column_name='user_id';

  IF infomusic_user_type IS DISTINCT FROM 'uuid' THEN
    RAISE EXCEPTION 'infomusic.user_id must be uuid; found %.', coalesce(infomusic_user_type, 'missing');
  END IF;

  IF EXISTS (SELECT 1 FROM public.infomusic WHERE user_id IS NULL) THEN
    RAISE EXCEPTION 'infomusic contains rows without user_id. Restore an approved owner mapping before enforcing NOT NULL; no rows were deleted or reassigned.';
  END IF;

  SELECT count(*)
    INTO orphan_owners
  FROM public.infomusic i
  LEFT JOIN auth.users u ON u.id=i.user_id
  WHERE i.user_id IS NOT NULL AND u.id IS NULL;

  IF orphan_owners > 0 THEN
    RAISE EXCEPTION 'infomusic contains % user_id values without a matching auth.users row. Reconcile ownership before adding the foreign key.', orphan_owners;
  END IF;

  ALTER TABLE public.infomusic
    ALTER COLUMN user_id SET NOT NULL;

  SELECT pg_get_constraintdef(oid)
    INTO infomusic_fk_definition
  FROM pg_constraint
  WHERE conrelid='public.infomusic'::regclass
    AND conname='infomusic_user_id_fkey';

  IF infomusic_fk_definition IS NULL THEN
    ALTER TABLE public.infomusic
      ADD CONSTRAINT infomusic_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;
    ALTER TABLE public.infomusic
      VALIDATE CONSTRAINT infomusic_user_id_fkey;
  ELSIF infomusic_fk_definition <> 'FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE' THEN
    RAISE EXCEPTION 'infomusic_user_id_fkey has an unexpected definition: %.', infomusic_fk_definition;
  END IF;

  CREATE INDEX IF NOT EXISTS idx_infomusic_user_id
    ON public.infomusic(user_id);
END
$migration$;

NOTIFY pgrst, 'reload schema';
