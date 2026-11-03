-- OAuth state is stored only as a hash and is single-use with a short expiry.
CREATE TABLE IF NOT EXISTS public.google_calendar_oauth_states (
  state_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.google_calendar_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.google_calendar_oauth_states FROM anon, authenticated;

-- OAuth credentials must never be readable or writable by the browser client.
ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can view own google tokens" ON public.google_calendar_tokens;
DROP POLICY IF EXISTS "Users can insert own google tokens" ON public.google_calendar_tokens;
DROP POLICY IF EXISTS "Users can update own google tokens" ON public.google_calendar_tokens;
DROP POLICY IF EXISTS "Users can delete own google tokens" ON public.google_calendar_tokens;
DROP POLICY IF EXISTS "tenant_isolation_google_calendar_tokens" ON public.google_calendar_tokens;
REVOKE ALL ON public.google_calendar_tokens FROM anon, authenticated;
