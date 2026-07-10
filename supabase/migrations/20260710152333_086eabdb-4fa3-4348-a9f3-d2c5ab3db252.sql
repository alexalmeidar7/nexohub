
-- =========================================================================
-- SECURITY HARDENING MIGRATION
-- =========================================================================

-- 1) ROTEIROS — Remove broad share_token policies, add validated RPCs
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can view shared roteiros" ON public.roteiros;
DROP POLICY IF EXISTS "Public can update shared roteiros" ON public.roteiros;
DROP POLICY IF EXISTS "Authenticated can view shared roteiros" ON public.roteiros;
DROP POLICY IF EXISTS "Authenticated can update shared roteiros" ON public.roteiros;

CREATE OR REPLACE FUNCTION public.get_roteiro_by_share_token(_token text)
RETURNS SETOF public.roteiros
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT * FROM public.roteiros
   WHERE _token IS NOT NULL
     AND length(_token) >= 8
     AND share_token = _token
   LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.list_roteiros_historico_by_share_token(_token text, _limit int DEFAULT 10)
RETURNS SETOF public.roteiros
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.*
    FROM public.roteiros r
   WHERE _token IS NOT NULL
     AND length(_token) >= 8
     AND r.user_id = (SELECT user_id FROM public.roteiros WHERE share_token = _token LIMIT 1)
     AND r.share_token IS NOT NULL
   ORDER BY r.created_at DESC
   LIMIT COALESCE(_limit, 10);
$$;

CREATE OR REPLACE FUNCTION public.update_roteiro_by_share_token(
  _token text,
  _conteudo_html text,
  _participantes jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _token IS NULL OR length(_token) < 8 THEN
    RAISE EXCEPTION 'invalid share token';
  END IF;

  UPDATE public.roteiros
     SET conteudo_html = _conteudo_html,
         participantes = COALESCE(_participantes, participantes),
         apresentador_editado = true,
         editado_at = now()
   WHERE share_token = _token;
END;
$$;

REVOKE ALL ON FUNCTION public.get_roteiro_by_share_token(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_roteiros_historico_by_share_token(text, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_roteiro_by_share_token(text, text, jsonb) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_roteiro_by_share_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_roteiros_historico_by_share_token(text, int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_roteiro_by_share_token(text, text, jsonb) TO anon, authenticated;


-- 2) COMERCIAL_MOCKUPS — Restrict writes to admins only
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Mockups can be inserted by authenticated users" ON public.comercial_mockups;
DROP POLICY IF EXISTS "Mockups can be updated by authenticated users" ON public.comercial_mockups;

CREATE POLICY "Admins can insert comercial_mockups"
ON public.comercial_mockups
FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update comercial_mockups"
ON public.comercial_mockups
FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete comercial_mockups"
ON public.comercial_mockups
FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));


-- 3) VMIX_CONNECTIONS — Restrict role from public to authenticated
-- -------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view their own vmix connections" ON public.vmix_connections;
DROP POLICY IF EXISTS "Users can insert their own vmix connections" ON public.vmix_connections;
DROP POLICY IF EXISTS "Users can update their own vmix connections" ON public.vmix_connections;
DROP POLICY IF EXISTS "Users can delete their own vmix connections" ON public.vmix_connections;

CREATE POLICY "Users can view their own vmix connections"
ON public.vmix_connections
FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own vmix connections"
ON public.vmix_connections
FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own vmix connections"
ON public.vmix_connections
FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own vmix connections"
ON public.vmix_connections
FOR DELETE TO authenticated USING (auth.uid() = user_id);


-- 4) FUNCTION SEARCH PATH — Fix mutable search_path on trigger function
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_vmix_connections_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;


-- 5) STORAGE OWNERSHIP — Restrict UPDATE/DELETE to file owner
--    Buckets: comercial, empresa-assets, shopping, preroll
--    Reads remain public (needed for XML/vMix/kiosk).
--    Legacy files with NULL owner are protected — only service_role touches them.
-- -------------------------------------------------------------------------

-- COMERCIAL (drop old broad update/delete)
DROP POLICY IF EXISTS "Auth users update comercial" ON storage.objects;
DROP POLICY IF EXISTS "Auth users delete comercial" ON storage.objects;

CREATE POLICY "Owner updates comercial"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'comercial' AND owner = auth.uid())
WITH CHECK (bucket_id = 'comercial' AND owner = auth.uid());

CREATE POLICY "Owner deletes comercial"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'comercial' AND owner = auth.uid());

-- EMPRESA-ASSETS
DROP POLICY IF EXISTS "Authenticated users can update empresa assets" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete empresa assets" ON storage.objects;

CREATE POLICY "Owner updates empresa assets"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'empresa-assets' AND owner = auth.uid())
WITH CHECK (bucket_id = 'empresa-assets' AND owner = auth.uid());

CREATE POLICY "Owner deletes empresa assets"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'empresa-assets' AND owner = auth.uid());

-- SHOPPING
DROP POLICY IF EXISTS "Users can delete own shopping images" ON storage.objects;

CREATE POLICY "Owner deletes shopping"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'shopping' AND owner = auth.uid());

CREATE POLICY "Owner updates shopping"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'shopping' AND owner = auth.uid())
WITH CHECK (bucket_id = 'shopping' AND owner = auth.uid());

-- PREROLL
DROP POLICY IF EXISTS "Users can delete own preroll videos" ON storage.objects;

CREATE POLICY "Owner deletes preroll"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'preroll' AND owner = auth.uid());

CREATE POLICY "Owner updates preroll"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'preroll' AND owner = auth.uid())
WITH CHECK (bucket_id = 'preroll' AND owner = auth.uid());

-- XML-FILES — restrict updates/deletes to owner too
DROP POLICY IF EXISTS "Authenticated users can update xml files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete xml files" ON storage.objects;

CREATE POLICY "Owner updates xml files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'xml-files' AND owner = auth.uid())
WITH CHECK (bucket_id = 'xml-files' AND owner = auth.uid());

CREATE POLICY "Owner deletes xml files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'xml-files' AND owner = auth.uid());
