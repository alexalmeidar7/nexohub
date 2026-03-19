
CREATE TABLE public.xml_upload_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source text NOT NULL DEFAULT 'online',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.xml_upload_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own xml_upload_history"
  ON public.xml_upload_history
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_xml_upload_history_user ON public.xml_upload_history(user_id, created_at DESC);
