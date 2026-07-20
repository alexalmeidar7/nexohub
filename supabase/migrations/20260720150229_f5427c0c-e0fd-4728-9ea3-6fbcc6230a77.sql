CREATE TABLE public.player_listener_profiles (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  auth_user_id uuid NOT NULL,
  radio_user_id uuid NOT NULL,
  nome text,
  email text,
  cidade text,
  estado text,
  whatsapp text,
  sexo text,
  avatar_url text,
  cpf text,
  data_nascimento date,
  setor text,
  sub_profiles jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT player_listener_profiles_unique UNIQUE (auth_user_id, radio_user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.player_listener_profiles TO authenticated;
GRANT ALL ON public.player_listener_profiles TO service_role;
ALTER TABLE public.player_listener_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Listeners can view own radio profiles"
ON public.player_listener_profiles
FOR SELECT
TO authenticated
USING (auth.uid() = auth_user_id);
CREATE POLICY "Listeners can create own radio profiles"
ON public.player_listener_profiles
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = auth_user_id);
CREATE POLICY "Listeners can update own radio profiles"
ON public.player_listener_profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = auth_user_id)
WITH CHECK (auth.uid() = auth_user_id);
CREATE POLICY "Listeners can delete own radio profiles"
ON public.player_listener_profiles
FOR DELETE
TO authenticated
USING (auth.uid() = auth_user_id);
CREATE TRIGGER update_player_listener_profiles_updated_at
BEFORE UPDATE ON public.player_listener_profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.music_likes ADD COLUMN IF NOT EXISTS radio_user_id uuid;
ALTER TABLE public.watch_history ADD COLUMN IF NOT EXISTS radio_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_player_listener_profiles_auth_radio ON public.player_listener_profiles(auth_user_id, radio_user_id);
CREATE INDEX IF NOT EXISTS idx_music_likes_user_radio_created ON public.music_likes(user_id, radio_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_watch_history_user_radio_watched ON public.watch_history(user_id, radio_user_id, watched_at DESC);