ALTER TABLE public.agenda_eventos 
ADD COLUMN IF NOT EXISTS youtube_url text DEFAULT '',
ADD COLUMN IF NOT EXISTS artes_urls text[] DEFAULT '{}';