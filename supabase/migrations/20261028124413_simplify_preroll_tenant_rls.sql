DROP POLICY IF EXISTS comercial_preroll_tenant_select ON public.comercial_preroll;
DROP POLICY IF EXISTS comercial_preroll_tenant_insert ON public.comercial_preroll;
DROP POLICY IF EXISTS comercial_preroll_tenant_update ON public.comercial_preroll;
DROP POLICY IF EXISTS comercial_preroll_tenant_delete ON public.comercial_preroll;
CREATE POLICY comercial_preroll_tenant_select ON public.comercial_preroll
FOR SELECT TO authenticated USING (user_id = (SELECT public.current_tenant_user_id()));
CREATE POLICY comercial_preroll_tenant_insert ON public.comercial_preroll
FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT public.current_tenant_user_id()));
CREATE POLICY comercial_preroll_tenant_update ON public.comercial_preroll
FOR UPDATE TO authenticated
USING (user_id = (SELECT public.current_tenant_user_id()))
WITH CHECK (user_id = (SELECT public.current_tenant_user_id()));
CREATE POLICY comercial_preroll_tenant_delete ON public.comercial_preroll
FOR DELETE TO authenticated USING (user_id = (SELECT public.current_tenant_user_id()));
