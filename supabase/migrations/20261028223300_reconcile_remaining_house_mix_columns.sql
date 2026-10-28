-- Reconcile House Mix columns confirmed by the original schema inventory and existing migrations.
-- Additive/idempotent only. Never delete or rewrite existing rows.
--
-- The historical infomusic ownership migration deleted shared rows before adding user_id.
-- This replacement deliberately does not delete or guess ownership: it fails closed if
-- existing rows cannot satisfy the required NOT NULL ownership column.

ALTER TABLE public.infomusic
  ADD COLUMN IF NOT EXISTS user_id uuid;

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.infomusic
    WHERE user_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'public.infomusic contains rows without user_id. Restore an approved owner mapping before enforcing per-user ownership; this migration will not delete or reassign rows.';
  END IF;

  ALTER TABLE public.infomusic
    ALTER COLUMN user_id SET NOT NULL;
END
$migration$;

ALTER TABLE public.infomusic_excecoes
  ADD COLUMN IF NOT EXISTS artista_url text;

ALTER TABLE public.streaming_channels
  ADD COLUMN IF NOT EXISTS numero_canal text DEFAULT '';

ALTER TABLE public.streaming_channels
  ALTER COLUMN numero_canal SET DEFAULT '';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS event_types_config jsonb DEFAULT '{
    "live": {"color": "#2563eb", "label": "LIVE"},
    "gravacao": {"color": "#ef4444", "label": "GRAVAÇÃO"},
    "reuniao": {"color": "#8b5cf6", "label": "REUNIÃO"},
    "outro": {"color": "#6b7280", "label": "OUTRO"}
  }'::jsonb;

ALTER TABLE public.profiles
  ALTER COLUMN event_types_config SET DEFAULT '{
    "live": {"color": "#2563eb", "label": "LIVE"},
    "gravacao": {"color": "#ef4444", "label": "GRAVAÇÃO"},
    "reuniao": {"color": "#8b5cf6", "label": "REUNIÃO"},
    "outro": {"color": "#6b7280", "label": "OUTRO"}
  }'::jsonb;

COMMENT ON COLUMN public.profiles.event_types_config IS
  'Configuração personalizada de cores e rótulos para tipos de eventos na agenda.';
