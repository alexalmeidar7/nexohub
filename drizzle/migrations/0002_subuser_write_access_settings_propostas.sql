-- Permitir que sub-usuários ativos editem os dados do usuário master
-- nas páginas liberadas (config tela promo, propostas, mockups).

-- user_settings: sub-usuários já leem; agora podem criar/editar/apagar
CREATE POLICY "Sub-users can insert parent user_settings"
ON public.user_settings FOR INSERT TO authenticated
WITH CHECK (EXISTS (
  SELECT 1 FROM public.sub_users s
  WHERE s.auth_user_id = auth.uid() AND s.parent_user_id = user_settings.user_id AND s.ativo = true
));

CREATE POLICY "Sub-users can update parent user_settings"
ON public.user_settings FOR UPDATE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.sub_users s
  WHERE s.auth_user_id = auth.uid() AND s.parent_user_id = user_settings.user_id AND s.ativo = true
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.sub_users s
  WHERE s.auth_user_id = auth.uid() AND s.parent_user_id = user_settings.user_id AND s.ativo = true
));

CREATE POLICY "Sub-users can delete parent user_settings"
ON public.user_settings FOR DELETE TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.sub_users s
  WHERE s.auth_user_id = auth.uid() AND s.parent_user_id = user_settings.user_id AND s.ativo = true
));

-- comercial_propostas: acesso completo do sub-usuário às propostas do master
CREATE POLICY "Sub-users manage parent comercial_propostas"
ON public.comercial_propostas FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.sub_users s
  WHERE s.auth_user_id = auth.uid() AND s.parent_user_id = comercial_propostas.user_id AND s.ativo = true
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.sub_users s
  WHERE s.auth_user_id = auth.uid() AND s.parent_user_id = comercial_propostas.user_id AND s.ativo = true
));

-- comercial_mockups: mockups são compartilhados; sub-usuários ativos podem gerenciar
CREATE POLICY "Sub-users manage comercial_mockups"
ON public.comercial_mockups FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.sub_users s
  WHERE s.auth_user_id = auth.uid() AND s.ativo = true
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.sub_users s
  WHERE s.auth_user_id = auth.uid() AND s.ativo = true
));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comercial_propostas TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comercial_mockups TO authenticated;