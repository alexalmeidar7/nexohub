ALTER TABLE public.user_settings 
ADD COLUMN IF NOT EXISTS infomusic_ai_monthly_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS infomusic_ai_last_reset TIMESTAMP WITH TIME ZONE DEFAULT now();