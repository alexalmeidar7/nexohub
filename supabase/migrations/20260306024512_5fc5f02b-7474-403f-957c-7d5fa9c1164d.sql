CREATE POLICY "Users can delete own messages"
ON public.admin_messages
FOR DELETE
TO authenticated
USING (recipient_id = auth.uid());