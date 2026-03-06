
CREATE TABLE public.admin_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  recipient_id uuid,
  subject text NOT NULL DEFAULT '',
  message text NOT NULL DEFAULT '',
  is_broadcast boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage all messages"
ON public.admin_messages FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own messages"
ON public.admin_messages FOR SELECT TO authenticated
USING (recipient_id = auth.uid() OR is_broadcast = true);
