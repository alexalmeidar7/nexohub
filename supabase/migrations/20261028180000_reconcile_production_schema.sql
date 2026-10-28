-- Reconcile columns referenced by the deployed House Mix frontend.
-- Safe for existing databases: all additions are idempotent and preserve current rows.

ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS dashboard_items jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.empresa_config
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo';

ALTER TABLE public.infomusic_excecoes
  ADD COLUMN IF NOT EXISTS artista_url text;

-- The application scopes Infomusic queries by user_id. Keep existing catalog
-- rows valid while enabling tenant ownership for new/user-specific rows.
ALTER TABLE public.infomusic
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_infomusic_user_id
  ON public.infomusic(user_id);

NOTIFY pgrst, 'reload schema';
