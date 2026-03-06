
CREATE POLICY "Users can mark own messages as read"
ON public.admin_messages FOR UPDATE TO authenticated
USING (recipient_id = auth.uid())
WITH CHECK (recipient_id = auth.uid());
