ALTER TABLE public.streaming_channels ALTER COLUMN numero_canal TYPE text USING numero_canal::text;
ALTER TABLE public.streaming_channels ALTER COLUMN numero_canal SET DEFAULT '';