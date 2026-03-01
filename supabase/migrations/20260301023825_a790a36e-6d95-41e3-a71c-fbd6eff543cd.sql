
-- Create chat messages table for player live chat
CREATE TABLE public.player_chat_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  channel_id TEXT NOT NULL,
  nome TEXT NOT NULL,
  cidade TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.player_chat_messages ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read messages
CREATE POLICY "Anyone can read chat messages"
ON public.player_chat_messages
FOR SELECT
USING (true);

-- Anyone authenticated can insert messages
CREATE POLICY "Authenticated users can send messages"
ON public.player_chat_messages
FOR INSERT
WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.player_chat_messages;

-- Auto-cleanup old messages (older than 24h)
CREATE OR REPLACE FUNCTION public.cleanup_old_chat_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.player_chat_messages WHERE created_at < now() - interval '24 hours';
END;
$$;
