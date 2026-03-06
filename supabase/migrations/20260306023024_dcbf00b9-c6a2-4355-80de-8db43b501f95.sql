
ALTER TABLE public.admin_messages ADD COLUMN is_read boolean NOT NULL DEFAULT false;

ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_messages;
