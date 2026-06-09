DROP POLICY IF EXISTS "Authenticated users can send messages" ON public.player_chat_messages;
CREATE POLICY "Authenticated users can send messages"
ON public.player_chat_messages
FOR INSERT
TO authenticated
WITH CHECK (
  length(message) > 0 AND length(message) <= 1000
  AND length(nome) > 0 AND length(nome) <= 100
  AND length(cidade) <= 100
  AND length(channel_id) > 0 AND length(channel_id) <= 200
);