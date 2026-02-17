
CREATE TABLE public.escalada_news (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  portal TEXT NOT NULL,
  title TEXT NOT NULL,
  image_url TEXT DEFAULT ''::text,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.escalada_news ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own escalada_news"
  ON public.escalada_news
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
