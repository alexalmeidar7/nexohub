CREATE POLICY "Sub-users can view parent vmix connections"
ON public.vmix_connections FOR SELECT TO authenticated
USING (user_id = public.current_parent_user_id());