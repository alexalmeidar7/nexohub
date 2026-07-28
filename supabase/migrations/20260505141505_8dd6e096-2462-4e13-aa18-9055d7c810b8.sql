-- Add deezer_artist_img to infomusic
ALTER TABLE public.infomusic ADD COLUMN IF NOT EXISTS deezer_artist_img TEXT;

-- Add last_manual_curiosity_id to user_settings to track the last sent curiosity
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS last_manual_curiosity_id UUID REFERENCES public.infomusic(id);