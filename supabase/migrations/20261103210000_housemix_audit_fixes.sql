-- House Mix production audit: missing FK indexes, RLS initplan optimizations,
-- and SECURITY DEFINER RPC hardening. Changes are additive / policy-equivalent.

BEGIN;

-- Index all foreign-key columns reported without a covering index.
CREATE INDEX IF NOT EXISTS idx_agenda_eventos_programa_id_fk ON public.agenda_eventos (programa_id);
CREATE INDEX IF NOT EXISTS idx_agenda_participantes_evento_id_fk ON public.agenda_participantes (evento_id);
CREATE INDEX IF NOT EXISTS idx_cenario_estudio_web_user_id_fk ON public.cenario_estudio_web (user_id);
CREATE INDEX IF NOT EXISTS idx_client_actions_history_user_id_fk ON public.client_actions_history (user_id);
CREATE INDEX IF NOT EXISTS idx_client_modules_module_key_fk ON public.client_modules (module_key);
CREATE INDEX IF NOT EXISTS idx_comercial_propostas_mockup_id_fk ON public.comercial_propostas (mockup_id);
CREATE INDEX IF NOT EXISTS idx_comercial_propostas_user_id_fk ON public.comercial_propostas (user_id);
CREATE INDEX IF NOT EXISTS idx_custom_news_sites_parent_id_fk ON public.custom_news_sites (parent_id);
CREATE INDEX IF NOT EXISTS idx_logos_patrocinadores_programa_id_fk ON public.logos_patrocinadores (programa_id);
CREATE INDEX IF NOT EXISTS idx_programa_automacoes_programa_id_fk ON public.programa_automacoes (programa_id);
CREATE INDEX IF NOT EXISTS idx_programas_apresentador_id_fk ON public.programas (apresentador_id);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_user_id_fk ON public.prompt_templates (user_id);
CREATE INDEX IF NOT EXISTS idx_shopping_products_program_id_fk ON public.shopping_products (program_id);
CREATE INDEX IF NOT EXISTS idx_site_noticias_categoria_id_fk ON public.site_noticias (categoria_id);
CREATE INDEX IF NOT EXISTS idx_sorteio_premio_programas_programa_id_fk ON public.sorteio_premio_programas (programa_id);
CREATE INDEX IF NOT EXISTS idx_sorteio_premios_programa_id_fk ON public.sorteio_premios (programa_id);
CREATE INDEX IF NOT EXISTS idx_sorteio_sorteios_ouvinte_id_fk ON public.sorteio_sorteios (ouvinte_id);
CREATE INDEX IF NOT EXISTS idx_sorteio_sorteios_premio_id_fk ON public.sorteio_sorteios (premio_id);
CREATE INDEX IF NOT EXISTS idx_testemunhais_programa_id_fk ON public.testemunhais (programa_id);
CREATE INDEX IF NOT EXISTS idx_wa_contacts_ouvinte_id_fk ON public.wa_contacts (ouvinte_id);
CREATE INDEX IF NOT EXISTS idx_watch_history_channel_id_fk ON public.watch_history (channel_id);

-- Keep tenant role checks callable by authenticated users, but prevent checking
-- another user's role. Browser clients cannot call the privileged music-history RPC.
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $function$
  SELECT CASE
    WHEN auth.uid() IS NOT NULL AND auth.uid() <> _user_id THEN false
    ELSE EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
  END;
$function$;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_music_history_light(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_music_history_light(uuid, integer) TO service_role;

-- Preserve policy behavior while evaluating auth.uid()/has_role once per statement.
DROP POLICY IF EXISTS "Admins manage messages" ON public.admin_messages;
CREATE POLICY "Admins manage messages" ON public.admin_messages
FOR ALL TO authenticated
USING ((SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role)))
WITH CHECK ((SELECT public.has_role((SELECT auth.uid()), 'admin'::public.app_role)));

DROP POLICY IF EXISTS "Users view own messages" ON public.admin_messages;
CREATE POLICY "Users view own messages" ON public.admin_messages
FOR SELECT TO authenticated
USING ((recipient_id = (SELECT auth.uid())) OR (is_broadcast = true));

DROP POLICY IF EXISTS "Public read published site news" ON public.site_noticias;
CREATE POLICY "Public read published site news" ON public.site_noticias
FOR SELECT TO public
USING ((publicado = true) OR ((SELECT auth.uid()) = user_id));

-- Fail the migration if the key grants drift from the intended least-privilege state.
DO $verify$
BEGIN
  IF has_function_privilege('anon', 'public.has_role(uuid, public.app_role)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon must not execute has_role';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.has_role(uuid, public.app_role)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated must retain has_role for RLS policies';
  END IF;
  IF has_function_privilege('anon', 'public.get_music_history_light(uuid, integer)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.get_music_history_light(uuid, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'get_music_history_light must not be exposed to browser roles';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.get_music_history_light(uuid, integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role must retain XML music-history access';
  END IF;
END
$verify$;

COMMIT;
