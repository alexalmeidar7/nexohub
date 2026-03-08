CREATE TABLE public.watch_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  channel_id uuid REFERENCES public.streaming_channels(id) ON DELETE CASCADE,
  channel_name text NOT NULL DEFAULT '',
  channel_cover_url text DEFAULT '',
  channel_logo_url text DEFAULT '',
  channel_type text NOT NULL DEFAULT 'video',
  watched_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.watch_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own watch history"
  ON public.watch_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own watch history"
  ON public.watch_history FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own watch history"
  ON public.watch_history FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_watch_history_user_watched ON public.watch_history(user_id, watched_at DESC);