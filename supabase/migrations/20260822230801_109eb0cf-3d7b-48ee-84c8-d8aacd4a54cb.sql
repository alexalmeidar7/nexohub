CREATE POLICY "Sub-users manage parent audiencia_historico"
  ON public.audiencia_historico FOR ALL
  TO authenticated
  USING (user_id IN (SELECT parent_user_id FROM public.sub_users WHERE auth_user_id = auth.uid() AND ativo = true))
  WITH CHECK (user_id IN (SELECT parent_user_id FROM public.sub_users WHERE auth_user_id = auth.uid() AND ativo = true));