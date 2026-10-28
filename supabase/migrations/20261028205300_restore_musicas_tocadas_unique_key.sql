-- Restore the original House Mix deduplication key used by musicas_tocadas upserts.
-- The original database inventory records this exact unique constraint.
-- Fail closed if restored data contains duplicate keys; never delete or rewrite rows.

DO $migration$
DECLARE
  constraint_definition text;
BEGIN
  IF to_regclass('public.musicas_tocadas') IS NULL THEN
    RAISE EXCEPTION 'public.musicas_tocadas is missing; restore the House Mix table before this migration.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'musicas_tocadas'
      AND column_name IN ('user_id', 'musica', 'artista', 'dia')
    GROUP BY table_name
    HAVING count(*) = 4
  ) THEN
    RAISE EXCEPTION 'musicas_tocadas is missing one or more columns required by the original unique key.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.musicas_tocadas
    GROUP BY user_id, musica, artista, dia
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate musicas_tocadas keys exist. Resolve them with an approved data-reconciliation plan; this migration will not delete rows.';
  END IF;

  SELECT pg_get_constraintdef(oid)
    INTO constraint_definition
  FROM pg_constraint
  WHERE conrelid = 'public.musicas_tocadas'::regclass
    AND conname = 'musicas_tocadas_user_musica_artista_dia_key';

  IF constraint_definition IS NULL THEN
    IF EXISTS (
      SELECT 1
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'musicas_tocadas_user_musica_artista_dia_key'
        AND c.relkind = 'i'
    ) THEN
      RAISE EXCEPTION 'An index with the expected name exists without the original constraint; reconcile manually before continuing.';
    END IF;

    ALTER TABLE public.musicas_tocadas
      ADD CONSTRAINT musicas_tocadas_user_musica_artista_dia_key
      UNIQUE (user_id, musica, artista, dia);
  ELSIF constraint_definition <> 'UNIQUE (user_id, musica, artista, dia)' THEN
    RAISE EXCEPTION 'The existing musicas_tocadas unique constraint has an unexpected definition: %', constraint_definition;
  END IF;
END
$migration$;
