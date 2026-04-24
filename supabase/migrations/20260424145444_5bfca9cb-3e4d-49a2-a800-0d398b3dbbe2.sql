-- Tabela de grupos
CREATE TABLE public.cenario_estudio_grupos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  nome text NOT NULL DEFAULT 'Novo grupo',
  rows integer NOT NULL DEFAULT 1,
  cols integer NOT NULL DEFAULT 1,
  programa_ids uuid[] NOT NULL DEFAULT '{}',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.cenario_estudio_grupos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own cenario_estudio_grupos"
  ON public.cenario_estudio_grupos FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Sub-users can view parent cenario_estudio_grupos"
  ON public.cenario_estudio_grupos FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sub_users
    WHERE sub_users.auth_user_id = auth.uid()
      AND sub_users.parent_user_id = cenario_estudio_grupos.user_id
      AND sub_users.ativo = true
  ));

CREATE POLICY "Sub-users can insert parent cenario_estudio_grupos"
  ON public.cenario_estudio_grupos FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sub_users
    WHERE sub_users.auth_user_id = auth.uid()
      AND sub_users.parent_user_id = cenario_estudio_grupos.user_id
      AND sub_users.ativo = true
  ));

CREATE POLICY "Sub-users can update parent cenario_estudio_grupos"
  ON public.cenario_estudio_grupos FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sub_users
    WHERE sub_users.auth_user_id = auth.uid()
      AND sub_users.parent_user_id = cenario_estudio_grupos.user_id
      AND sub_users.ativo = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sub_users
    WHERE sub_users.auth_user_id = auth.uid()
      AND sub_users.parent_user_id = cenario_estudio_grupos.user_id
      AND sub_users.ativo = true
  ));

CREATE POLICY "Sub-users can delete parent cenario_estudio_grupos"
  ON public.cenario_estudio_grupos FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sub_users
    WHERE sub_users.auth_user_id = auth.uid()
      AND sub_users.parent_user_id = cenario_estudio_grupos.user_id
      AND sub_users.ativo = true
  ));

CREATE TRIGGER update_cenario_estudio_grupos_updated_at
  BEFORE UPDATE ON public.cenario_estudio_grupos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_cenario_estudio_grupos_user ON public.cenario_estudio_grupos(user_id);
CREATE INDEX idx_cenario_estudio_grupos_programas ON public.cenario_estudio_grupos USING GIN(programa_ids);

-- Tabela de TVs
CREATE TABLE public.cenario_estudio_tvs (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  grupo_id uuid NOT NULL REFERENCES public.cenario_estudio_grupos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  posicao integer NOT NULL DEFAULT 0,
  imagem_url text NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(grupo_id, posicao)
);

ALTER TABLE public.cenario_estudio_tvs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own cenario_estudio_tvs"
  ON public.cenario_estudio_tvs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Sub-users can view parent cenario_estudio_tvs"
  ON public.cenario_estudio_tvs FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sub_users
    WHERE sub_users.auth_user_id = auth.uid()
      AND sub_users.parent_user_id = cenario_estudio_tvs.user_id
      AND sub_users.ativo = true
  ));

CREATE POLICY "Sub-users can insert parent cenario_estudio_tvs"
  ON public.cenario_estudio_tvs FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sub_users
    WHERE sub_users.auth_user_id = auth.uid()
      AND sub_users.parent_user_id = cenario_estudio_tvs.user_id
      AND sub_users.ativo = true
  ));

CREATE POLICY "Sub-users can update parent cenario_estudio_tvs"
  ON public.cenario_estudio_tvs FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sub_users
    WHERE sub_users.auth_user_id = auth.uid()
      AND sub_users.parent_user_id = cenario_estudio_tvs.user_id
      AND sub_users.ativo = true
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sub_users
    WHERE sub_users.auth_user_id = auth.uid()
      AND sub_users.parent_user_id = cenario_estudio_tvs.user_id
      AND sub_users.ativo = true
  ));

CREATE POLICY "Sub-users can delete parent cenario_estudio_tvs"
  ON public.cenario_estudio_tvs FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sub_users
    WHERE sub_users.auth_user_id = auth.uid()
      AND sub_users.parent_user_id = cenario_estudio_tvs.user_id
      AND sub_users.ativo = true
  ));

CREATE TRIGGER update_cenario_estudio_tvs_updated_at
  BEFORE UPDATE ON public.cenario_estudio_tvs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_cenario_estudio_tvs_grupo ON public.cenario_estudio_tvs(grupo_id);

-- Bucket de armazenamento
INSERT INTO storage.buckets (id, name, public)
VALUES ('cenario-estudio', 'cenario-estudio', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Cenario estudio images are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'cenario-estudio');

CREATE POLICY "Authenticated users can upload cenario estudio images"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'cenario-estudio' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Authenticated users can update own cenario estudio images"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'cenario-estudio' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Authenticated users can delete own cenario estudio images"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'cenario-estudio' AND auth.uid()::text = (storage.foldername(name))[1]);