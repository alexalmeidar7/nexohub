CREATE TABLE IF NOT EXISTS public.tv_pairing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug_user_id uuid,
  user_slug text,
  tv_session_id text,
  code text,
  event_type text NOT NULL,
  reason text,
  paired_user_id uuid,
  paired_email text,
  user_agent text,
  ip text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tv_pairing_events_slug_user_id_idx ON public.tv_pairing_events (slug_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tv_pairing_events_code_idx ON public.tv_pairing_events (code);
CREATE INDEX IF NOT EXISTS tv_pairing_events_tv_session_idx ON public.tv_pairing_events (tv_session_id);
CREATE INDEX IF NOT EXISTS tv_pairing_events_event_type_idx ON public.tv_pairing_events (event_type, created_at DESC);

GRANT SELECT ON public.tv_pairing_events TO authenticated;
GRANT ALL ON public.tv_pairing_events TO service_role;

ALTER TABLE public.tv_pairing_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Radio owner can read own pairing events"
  ON public.tv_pairing_events
  FOR SELECT
  TO authenticated
  USING (slug_user_id = auth.uid());