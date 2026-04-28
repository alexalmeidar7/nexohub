
ALTER TABLE public.user_settings ADD COLUMN IF NOT EXISTS infomusic_ai_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.infomusic ALTER COLUMN expires_at SET DEFAULT (now() + interval '90 days');

UPDATE public.infomusic SET expires_at = created_at + interval '90 days';
