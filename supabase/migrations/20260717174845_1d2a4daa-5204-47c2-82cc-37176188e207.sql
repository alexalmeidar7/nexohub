
-- SEO/branding fields for site_config
ALTER TABLE public.site_config
  ADD COLUMN IF NOT EXISTS logo_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS favicon_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS meta_description text DEFAULT '',
  ADD COLUMN IF NOT EXISTS meta_keywords text DEFAULT '',
  ADD COLUMN IF NOT EXISTS og_image_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS site_dominio text DEFAULT '';

-- Deploy config (FTP/SFTP credentials)
CREATE TABLE IF NOT EXISTS public.site_deploy_config (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  protocol text NOT NULL DEFAULT 'ftp' CHECK (protocol IN ('ftp','ftps','sftp')),
  host text NOT NULL DEFAULT '',
  port integer NOT NULL DEFAULT 21,
  username text NOT NULL DEFAULT '',
  password text NOT NULL DEFAULT '',
  remote_path text NOT NULL DEFAULT '/public_html',
  auto_publish boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_deploy_config TO authenticated;
GRANT ALL ON public.site_deploy_config TO service_role;
ALTER TABLE public.site_deploy_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deploy_config owner manage"
  ON public.site_deploy_config FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_site_deploy_config_updated_at
  BEFORE UPDATE ON public.site_deploy_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Deploy history
CREATE TABLE IF NOT EXISTS public.site_deploy_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('success','error','running')),
  message text DEFAULT '',
  files_count integer DEFAULT 0,
  bytes_sent bigint DEFAULT 0,
  duration_ms integer DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_deploy_history TO authenticated;
GRANT ALL ON public.site_deploy_history TO service_role;
ALTER TABLE public.site_deploy_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "deploy_history owner read"
  ON public.site_deploy_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "deploy_history owner insert"
  ON public.site_deploy_history FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_deploy_history_user_date
  ON public.site_deploy_history(user_id, created_at DESC);
