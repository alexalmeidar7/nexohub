CREATE TABLE public.transcricoes_streaming (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL DEFAULT auth.uid(),
  texto_transcrito TEXT NOT NULL,
  timestamp_inicio TIMESTAMPTZ NOT NULL DEFAULT now(),
  timestamp_fim TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transcricoes_streaming TO authenticated;
GRANT ALL ON public.transcricoes_streaming TO service_role;

ALTER TABLE public.transcricoes_streaming ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own transcriptions select" ON public.transcricoes_streaming
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR user_id = public.current_parent_user_id());

CREATE POLICY "Own transcriptions insert" ON public.transcricoes_streaming
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR user_id = public.current_parent_user_id());

CREATE POLICY "Own transcriptions update" ON public.transcricoes_streaming
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR user_id = public.current_parent_user_id());

CREATE POLICY "Own transcriptions delete" ON public.transcricoes_streaming
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR user_id = public.current_parent_user_id());

CREATE INDEX idx_transcricoes_streaming_user_time ON public.transcricoes_streaming (user_id, timestamp_inicio DESC);

ALTER TABLE public.transcricoes_streaming REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.transcricoes_streaming;