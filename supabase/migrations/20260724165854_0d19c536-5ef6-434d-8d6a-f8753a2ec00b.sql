ALTER TABLE public.infomusic ALTER COLUMN expires_at SET DEFAULT 'infinity'::timestamptz;
UPDATE public.infomusic SET expires_at = 'infinity'::timestamptz WHERE expires_at < 'infinity'::timestamptz;
DROP FUNCTION IF EXISTS public.cleanup_infomusic();