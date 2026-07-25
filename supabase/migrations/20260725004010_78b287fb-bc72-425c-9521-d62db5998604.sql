CREATE TABLE public.tv_pairing_codes (
  code text PRIMARY KEY,
  slug_user_id uuid NOT NULL,
  user_slug text NOT NULL,
  tv_session_id text NOT NULL,
  paired_user_id uuid NULL,
  paired_email text NULL,
  paired_name text NULL,
  paired_avatar text NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes')
);

CREATE INDEX tv_pairing_codes_slug_idx ON public.tv_pairing_codes (user_slug);
CREATE INDEX tv_pairing_codes_status_idx ON public.tv_pairing_codes (status, expires_at);

GRANT SELECT ON public.tv_pairing_codes TO anon;
GRANT SELECT ON public.tv_pairing_codes TO authenticated;
GRANT ALL ON public.tv_pairing_codes TO service_role;

ALTER TABLE public.tv_pairing_codes ENABLE ROW LEVEL SECURITY;

-- Qualquer visitante (TV pública) pode consultar códigos pelo próprio code.
CREATE POLICY "public read tv_pairing_codes"
  ON public.tv_pairing_codes
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Escrita apenas via service_role (edge functions). Nenhuma policy INSERT/UPDATE
-- é criada, o que bloqueia gravação por anon/authenticated.

ALTER PUBLICATION supabase_realtime ADD TABLE public.tv_pairing_codes;