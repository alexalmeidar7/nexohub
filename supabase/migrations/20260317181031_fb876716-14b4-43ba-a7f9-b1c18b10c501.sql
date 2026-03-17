
ALTER TABLE public.comercial_preroll 
ADD COLUMN background_url text DEFAULT '',
ADD COLUMN aspect_ratio text NOT NULL DEFAULT '16:9',
ADD COLUMN video_position text NOT NULL DEFAULT 'center';
