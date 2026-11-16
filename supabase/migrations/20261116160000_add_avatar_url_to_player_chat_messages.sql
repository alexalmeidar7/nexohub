-- Store the sender's chat avatar with each message so every listener sees the
-- avatar selected by the sender. This is additive and preserves existing rows.
ALTER TABLE public.player_chat_messages
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;
