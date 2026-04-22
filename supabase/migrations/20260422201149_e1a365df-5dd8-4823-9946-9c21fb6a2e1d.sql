
-- Helper macro pattern: for each table, add INSERT/UPDATE/DELETE policies for sub-users
-- where they can manage data of their parent_user_id.

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'logos_patrocinadores',
    'agenda_eventos',
    'agenda_participantes',
    'apresentadores',
    'batalhas_agendadas',
    'comercial_preroll',
    'custom_enquete_categories',
    'custom_news_sites',
    'custom_quiz_categories',
    'custom_vmix_buttons',
    'enquetes_agendadas',
    'escalada_news',
    'musicas_tocadas',
    'preset_commands',
    'programa_automacoes',
    'programas',
    'quiz_agendados',
    'roteiros',
    'selected_cotacoes',
    'selected_news',
    'shopping_products',
    'streaming_channels'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Sub-users can insert parent %1$s" ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "Sub-users can update parent %1$s" ON public.%1$s', t);
    EXECUTE format('DROP POLICY IF EXISTS "Sub-users can delete parent %1$s" ON public.%1$s', t);

    EXECUTE format($f$
      CREATE POLICY "Sub-users can insert parent %1$s"
      ON public.%1$s FOR INSERT TO authenticated
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.sub_users
        WHERE sub_users.auth_user_id = auth.uid()
          AND sub_users.parent_user_id = %1$s.user_id
          AND sub_users.ativo = true
      ))
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY "Sub-users can update parent %1$s"
      ON public.%1$s FOR UPDATE TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.sub_users
        WHERE sub_users.auth_user_id = auth.uid()
          AND sub_users.parent_user_id = %1$s.user_id
          AND sub_users.ativo = true
      ))
      WITH CHECK (EXISTS (
        SELECT 1 FROM public.sub_users
        WHERE sub_users.auth_user_id = auth.uid()
          AND sub_users.parent_user_id = %1$s.user_id
          AND sub_users.ativo = true
      ))
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY "Sub-users can delete parent %1$s"
      ON public.%1$s FOR DELETE TO authenticated
      USING (EXISTS (
        SELECT 1 FROM public.sub_users
        WHERE sub_users.auth_user_id = auth.uid()
          AND sub_users.parent_user_id = %1$s.user_id
          AND sub_users.ativo = true
      ))
    $f$, t);
  END LOOP;
END $$;
