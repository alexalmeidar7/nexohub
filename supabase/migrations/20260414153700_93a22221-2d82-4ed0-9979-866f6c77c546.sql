
-- Add sub-user SELECT policies for all remaining tables that sub-users need access to

CREATE POLICY "Sub-users can view parent agenda_eventos"
  ON public.agenda_eventos FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sub_users WHERE sub_users.auth_user_id = auth.uid() AND sub_users.parent_user_id = agenda_eventos.user_id AND sub_users.ativo = true));

CREATE POLICY "Sub-users can view parent agenda_participantes"
  ON public.agenda_participantes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sub_users WHERE sub_users.auth_user_id = auth.uid() AND sub_users.parent_user_id = agenda_participantes.user_id AND sub_users.ativo = true));

CREATE POLICY "Sub-users can view parent selected_news"
  ON public.selected_news FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sub_users WHERE sub_users.auth_user_id = auth.uid() AND sub_users.parent_user_id = selected_news.user_id AND sub_users.ativo = true));

CREATE POLICY "Sub-users can view parent promocoes"
  ON public.promocoes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sub_users WHERE sub_users.auth_user_id = auth.uid() AND sub_users.parent_user_id = promocoes.user_id AND sub_users.ativo = true));

CREATE POLICY "Sub-users can view parent testemunhais"
  ON public.testemunhais FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sub_users WHERE sub_users.auth_user_id = auth.uid() AND sub_users.parent_user_id = testemunhais.user_id AND sub_users.ativo = true));

CREATE POLICY "Sub-users can view parent comercial_preroll"
  ON public.comercial_preroll FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sub_users WHERE sub_users.auth_user_id = auth.uid() AND sub_users.parent_user_id = comercial_preroll.user_id AND sub_users.ativo = true));

CREATE POLICY "Sub-users can view parent shopping_products"
  ON public.shopping_products FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sub_users WHERE sub_users.auth_user_id = auth.uid() AND sub_users.parent_user_id = shopping_products.user_id AND sub_users.ativo = true));

CREATE POLICY "Sub-users can view parent roteiros"
  ON public.roteiros FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sub_users WHERE sub_users.auth_user_id = auth.uid() AND sub_users.parent_user_id = roteiros.user_id AND sub_users.ativo = true));

CREATE POLICY "Sub-users can view parent musicas_tocadas"
  ON public.musicas_tocadas FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sub_users WHERE sub_users.auth_user_id = auth.uid() AND sub_users.parent_user_id = musicas_tocadas.user_id AND sub_users.ativo = true));

CREATE POLICY "Sub-users can view parent custom_vmix_buttons"
  ON public.custom_vmix_buttons FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sub_users WHERE sub_users.auth_user_id = auth.uid() AND sub_users.parent_user_id = custom_vmix_buttons.user_id AND sub_users.ativo = true));

CREATE POLICY "Sub-users can view parent preset_commands"
  ON public.preset_commands FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sub_users WHERE sub_users.auth_user_id = auth.uid() AND sub_users.parent_user_id = preset_commands.user_id AND sub_users.ativo = true));

CREATE POLICY "Sub-users can view parent teleprompters"
  ON public.teleprompters FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sub_users WHERE sub_users.auth_user_id = auth.uid() AND sub_users.parent_user_id = teleprompters.user_id AND sub_users.ativo = true));

CREATE POLICY "Sub-users can view parent enquetes_agendadas"
  ON public.enquetes_agendadas FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sub_users WHERE sub_users.auth_user_id = auth.uid() AND sub_users.parent_user_id = enquetes_agendadas.user_id AND sub_users.ativo = true));

CREATE POLICY "Sub-users can view parent batalhas_agendadas"
  ON public.batalhas_agendadas FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sub_users WHERE sub_users.auth_user_id = auth.uid() AND sub_users.parent_user_id = batalhas_agendadas.user_id AND sub_users.ativo = true));

CREATE POLICY "Sub-users can view parent escalada_news"
  ON public.escalada_news FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sub_users WHERE sub_users.auth_user_id = auth.uid() AND sub_users.parent_user_id = escalada_news.user_id AND sub_users.ativo = true));

CREATE POLICY "Sub-users can view parent custom_news_sites"
  ON public.custom_news_sites FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sub_users WHERE sub_users.auth_user_id = auth.uid() AND sub_users.parent_user_id = custom_news_sites.user_id AND sub_users.ativo = true));

CREATE POLICY "Sub-users can view parent selected_cotacoes"
  ON public.selected_cotacoes FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sub_users WHERE sub_users.auth_user_id = auth.uid() AND sub_users.parent_user_id = selected_cotacoes.user_id AND sub_users.ativo = true));

CREATE POLICY "Sub-users can view parent custom_enquete_categories"
  ON public.custom_enquete_categories FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM sub_users WHERE sub_users.auth_user_id = auth.uid() AND sub_users.parent_user_id = custom_enquete_categories.user_id AND sub_users.ativo = true));
