CREATE TABLE public.player_heartbeats (
  session_id TEXT PRIMARY KEY,
  master_user_id UUID NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_player_heartbeats_master_seen ON public.player_heartbeats(master_user_id, last_seen);
GRANT ALL ON public.player_heartbeats TO service_role;
ALTER TABLE public.player_heartbeats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only" ON public.player_heartbeats FOR ALL USING (false) WITH CHECK (false);