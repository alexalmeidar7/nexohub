
ALTER TABLE public.roteiros
  ADD COLUMN share_token TEXT UNIQUE DEFAULT NULL,
  ADD COLUMN share_login TEXT DEFAULT NULL,
  ADD COLUMN apresentador_editado BOOLEAN DEFAULT false,
  ADD COLUMN editado_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Allow public read/update on roteiros via share_token (for presenter access without auth)
CREATE POLICY "Public can view shared roteiros"
  ON public.roteiros
  FOR SELECT
  TO anon
  USING (share_token IS NOT NULL);

CREATE POLICY "Public can update shared roteiros"
  ON public.roteiros
  FOR UPDATE
  TO anon
  USING (share_token IS NOT NULL)
  WITH CHECK (share_token IS NOT NULL);
