
CREATE TABLE public.musicas_tocadas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  dia date NOT NULL DEFAULT CURRENT_DATE,
  horario time NOT NULL DEFAULT CURRENT_TIME,
  programa text NOT NULL DEFAULT '',
  artista text NOT NULL DEFAULT '',
  musica text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.musicas_tocadas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own musicas_tocadas"
  ON public.musicas_tocadas
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.cleanup_musicas_tocadas()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM public.musicas_tocadas;
END;
$$;
