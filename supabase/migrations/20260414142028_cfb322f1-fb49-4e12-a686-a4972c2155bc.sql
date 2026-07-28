
-- Allow sub-users to read their parent's empresa_config
CREATE POLICY "Sub-users can view parent empresa_config"
  ON public.empresa_config FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sub_users
      WHERE sub_users.auth_user_id = auth.uid()
      AND sub_users.parent_user_id = empresa_config.user_id
      AND sub_users.ativo = true
    )
  );

-- Allow sub-users to read parent's client_modules
CREATE POLICY "Sub-users can view parent client_modules"
  ON public.client_modules FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.sub_users
      WHERE sub_users.auth_user_id = auth.uid()
      AND sub_users.parent_user_id = client_modules.user_id
      AND sub_users.ativo = true
    )
  );

-- Allow sub-users to read parent's planos (already has public read, but just in case)
-- No change needed for planos as it already allows all authenticated to read
