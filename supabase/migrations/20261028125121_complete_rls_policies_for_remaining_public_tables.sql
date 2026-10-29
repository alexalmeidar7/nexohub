CREATE POLICY comercial_mockups_authenticated_read ON public.comercial_mockups FOR SELECT TO authenticated USING (true);
CREATE POLICY infomusic_authenticated_read ON public.infomusic FOR SELECT TO authenticated USING (true);
CREATE POLICY planos_authenticated_read ON public.planos FOR SELECT TO authenticated USING (true);

CREATE POLICY player_heartbeats_tenant_access ON public.player_heartbeats
FOR ALL TO authenticated
USING (master_user_id = (SELECT public.current_tenant_user_id()))
WITH CHECK (master_user_id = (SELECT public.current_tenant_user_id()));

CREATE POLICY player_listener_profiles_tenant_access ON public.player_listener_profiles
FOR ALL TO authenticated
USING (radio_user_id = (SELECT public.current_tenant_user_id()))
WITH CHECK (radio_user_id = (SELECT public.current_tenant_user_id()));

CREATE POLICY tv_pairing_codes_tenant_access ON public.tv_pairing_codes
FOR ALL TO authenticated
USING (slug_user_id = (SELECT public.current_tenant_user_id()))
WITH CHECK (slug_user_id = (SELECT public.current_tenant_user_id()));

CREATE POLICY tv_pairing_events_tenant_access ON public.tv_pairing_events
FOR ALL TO authenticated
USING (slug_user_id = (SELECT public.current_tenant_user_id()))
WITH CHECK (slug_user_id = (SELECT public.current_tenant_user_id()));
