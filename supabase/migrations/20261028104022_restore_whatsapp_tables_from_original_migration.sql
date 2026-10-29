CREATE TABLE public.wa_contacts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  phone TEXT NOT NULL,
  name TEXT,
  profile_name TEXT,
  ouvinte_id UUID REFERENCES public.ouvintes(id) ON DELETE SET NULL,
  tags TEXT[] NOT NULL DEFAULT '{}',
  flow_id UUID,
  flow_state JSONB NOT NULL DEFAULT '{}'::jsonb,
  human_takeover BOOLEAN NOT NULL DEFAULT false,
  last_message_at TIMESTAMPTZ,
  last_inbound_at TIMESTAMPTZ,
  unread_count INT NOT NULL DEFAULT 0,
  blocked BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, phone)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_contacts TO authenticated;
GRANT ALL ON public.wa_contacts TO service_role;
ALTER TABLE public.wa_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own wa_contacts" ON public.wa_contacts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_wa_contacts_user ON public.wa_contacts(user_id, last_message_at DESC);
CREATE TRIGGER update_wa_contacts_updated_at BEFORE UPDATE ON public.wa_contacts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.wa_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  contact_id UUID NOT NULL REFERENCES public.wa_contacts(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('in','out')),
  type TEXT NOT NULL DEFAULT 'text',
  body TEXT,
  media_url TEXT,
  wa_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  automation_id UUID,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_messages TO authenticated;
GRANT ALL ON public.wa_messages TO service_role;
ALTER TABLE public.wa_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own wa_messages" ON public.wa_messages FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX idx_wa_messages_contact ON public.wa_messages(contact_id, created_at DESC);
CREATE INDEX idx_wa_messages_user ON public.wa_messages(user_id, created_at DESC);

CREATE TABLE public.wa_flows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  trigger TEXT NOT NULL DEFAULT 'first_contact',
  trigger_value TEXT,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_flows TO authenticated;
GRANT ALL ON public.wa_flows TO service_role;
ALTER TABLE public.wa_flows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own wa_flows" ON public.wa_flows FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_wa_flows_updated_at BEFORE UPDATE ON public.wa_flows FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.wa_broadcasts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  message TEXT NOT NULL,
  audience_filter JSONB NOT NULL DEFAULT '{}'::jsonb,
  scheduled_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft',
  sent_count INT NOT NULL DEFAULT 0,
  fail_count INT NOT NULL DEFAULT 0,
  total_count INT NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_broadcasts TO authenticated;
GRANT ALL ON public.wa_broadcasts TO service_role;
ALTER TABLE public.wa_broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own wa_broadcasts" ON public.wa_broadcasts FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_wa_broadcasts_updated_at BEFORE UPDATE ON public.wa_broadcasts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.wa_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  phone_number_id TEXT NOT NULL,
  display_phone TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wa_config TO authenticated;
GRANT ALL ON public.wa_config TO service_role;
ALTER TABLE public.wa_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage their own wa_config" ON public.wa_config FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_wa_config_updated_at BEFORE UPDATE ON public.wa_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'wa_messages') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_messages;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'wa_contacts') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.wa_contacts;
  END IF;
END $$;
