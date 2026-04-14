
-- Sub-users can read parent's programas
CREATE POLICY "Sub-users can view parent programas"
ON public.programas FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sub_users
    WHERE sub_users.auth_user_id = auth.uid()
      AND sub_users.parent_user_id = programas.user_id
      AND sub_users.ativo = true
  )
);

-- Sub-users can read parent's apresentadores
CREATE POLICY "Sub-users can view parent apresentadores"
ON public.apresentadores FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sub_users
    WHERE sub_users.auth_user_id = auth.uid()
      AND sub_users.parent_user_id = apresentadores.user_id
      AND sub_users.ativo = true
  )
);

-- Sub-users can read parent's user_settings
CREATE POLICY "Sub-users can view parent user_settings"
ON public.user_settings FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sub_users
    WHERE sub_users.auth_user_id = auth.uid()
      AND sub_users.parent_user_id = user_settings.user_id
      AND sub_users.ativo = true
  )
);

-- Sub-users can read parent's streaming_channels
CREATE POLICY "Sub-users can view parent streaming_channels"
ON public.streaming_channels FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sub_users
    WHERE sub_users.auth_user_id = auth.uid()
      AND sub_users.parent_user_id = streaming_channels.user_id
      AND sub_users.ativo = true
  )
);

-- Sub-users can read parent's logos_patrocinadores
CREATE POLICY "Sub-users can view parent logos_patrocinadores"
ON public.logos_patrocinadores FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sub_users
    WHERE sub_users.auth_user_id = auth.uid()
      AND sub_users.parent_user_id = logos_patrocinadores.user_id
      AND sub_users.ativo = true
  )
);

-- Sub-users can read parent's profiles
CREATE POLICY "Sub-users can view parent profiles"
ON public.profiles FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.sub_users
    WHERE sub_users.auth_user_id = auth.uid()
      AND sub_users.parent_user_id = profiles.user_id
      AND sub_users.ativo = true
  )
);
