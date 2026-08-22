-- 1) broadcast_assuntos: remove blanket anonymous read, expose only via scoped function
DROP POLICY IF EXISTS "Public read assuntos" ON public.broadcast_assuntos;

CREATE OR REPLACE FUNCTION public.get_public_broadcast_assuntos(_user_id uuid, _programa_id uuid DEFAULT NULL)
RETURNS TABLE (
  mensagens jsonb,
  mensagens_enabled boolean[],
  font_family text,
  rotation_seconds integer,
  bg_color text,
  text_color text,
  updated_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT a.mensagens, a.mensagens_enabled, a.font_family, a.rotation_seconds, a.bg_color, a.text_color, a.updated_at
    FROM public.broadcast_assuntos a
   WHERE _user_id IS NOT NULL
     AND a.user_id = _user_id
     AND (_programa_id IS NULL OR a.programa_id = _programa_id)
   ORDER BY a.updated_at DESC
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_broadcast_assuntos(uuid, uuid) TO anon, authenticated;

-- 2) cenario_estudio_web: remove blanket read, expose single scene by id
DROP POLICY IF EXISTS "Public read web scenes" ON public.cenario_estudio_web;

CREATE OR REPLACE FUNCTION public.get_public_cenario_estudio_web(_id uuid)
RETURNS SETOF public.cenario_estudio_web
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.cenario_estudio_web
   WHERE _id IS NOT NULL AND id = _id
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_public_cenario_estudio_web(uuid) TO anon, authenticated;

-- 3) site_config: only owners may read (admin UI); edge functions use service role
DROP POLICY IF EXISTS "site_config public read" ON public.site_config;
REVOKE SELECT ON public.site_config FROM anon;

-- 4) sorteio_premio_programas: only owners may read
DROP POLICY IF EXISTS "Public read premio_programas" ON public.sorteio_premio_programas;
REVOKE SELECT ON public.sorteio_premio_programas FROM anon;

-- 5) testemunhais/promocoes: stop trusting user-editable auth metadata
DROP POLICY IF EXISTS "Sub-users manage parent testemunhais" ON public.testemunhais;
CREATE POLICY "Sub-users manage parent testemunhais"
ON public.testemunhais FOR ALL TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.sub_users s WHERE s.auth_user_id = auth.uid() AND s.parent_user_id = testemunhais.user_id AND s.ativo = true)
)
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.sub_users s WHERE s.auth_user_id = auth.uid() AND s.parent_user_id = testemunhais.user_id AND s.ativo = true)
);

DROP POLICY IF EXISTS "Sub-users manage parent promocoes" ON public.promocoes;
CREATE POLICY "Sub-users manage parent promocoes"
ON public.promocoes FOR ALL TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.sub_users s WHERE s.auth_user_id = auth.uid() AND s.parent_user_id = promocoes.user_id AND s.ativo = true)
)
WITH CHECK (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.sub_users s WHERE s.auth_user_id = auth.uid() AND s.parent_user_id = promocoes.user_id AND s.ativo = true)
);