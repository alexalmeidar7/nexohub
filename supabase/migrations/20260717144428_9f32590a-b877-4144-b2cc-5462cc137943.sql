
CREATE TABLE IF NOT EXISTS public.news_cache (
  site_id UUID PRIMARY KEY REFERENCES public.custom_news_sites(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  items JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_error TEXT
);
CREATE INDEX IF NOT EXISTS news_cache_user_id_idx ON public.news_cache(user_id);
CREATE INDEX IF NOT EXISTS news_cache_updated_at_idx ON public.news_cache(updated_at DESC);

GRANT SELECT ON public.news_cache TO authenticated;
GRANT ALL ON public.news_cache TO service_role;

ALTER TABLE public.news_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own news cache"
  ON public.news_cache FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
