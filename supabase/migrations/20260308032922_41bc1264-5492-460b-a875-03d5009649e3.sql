ALTER TABLE public.streaming_channels ADD COLUMN IF NOT EXISTS is_hd boolean DEFAULT false;
ALTER TABLE public.streaming_channels ADD COLUMN IF NOT EXISTS is_stereo boolean DEFAULT false;
ALTER TABLE public.streaming_channels ADD COLUMN IF NOT EXISTS classificacao_etaria text DEFAULT 'L';