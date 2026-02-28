
ALTER TABLE public.streaming_channels
ADD COLUMN numero_canal integer DEFAULT 0,
ADD COLUMN logo_url text DEFAULT '';
