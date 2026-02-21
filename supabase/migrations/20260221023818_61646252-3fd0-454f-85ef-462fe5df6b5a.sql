
-- Storage bucket for comercial images
INSERT INTO storage.buckets (id, name, public) VALUES ('comercial', 'comercial', true);

-- Storage policies for comercial bucket
CREATE POLICY "Public read comercial" ON storage.objects FOR SELECT USING (bucket_id = 'comercial');
CREATE POLICY "Auth users upload comercial" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'comercial' AND auth.role() = 'authenticated');
CREATE POLICY "Auth users update comercial" ON storage.objects FOR UPDATE USING (bucket_id = 'comercial' AND auth.role() = 'authenticated');
CREATE POLICY "Auth users delete comercial" ON storage.objects FOR DELETE USING (bucket_id = 'comercial' AND auth.role() = 'authenticated');

-- Testemunhais table
CREATE TABLE public.testemunhais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  programa_id uuid REFERENCES public.programas(id) ON DELETE SET NULL,
  imagem_url text DEFAULT '',
  texto text NOT NULL DEFAULT '',
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.testemunhais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own testemunhais" ON public.testemunhais FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Promoções table
CREATE TABLE public.promocoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  imagem_url text DEFAULT '',
  texto text NOT NULL DEFAULT '',
  oferecimento text DEFAULT '',
  data_inicio date NOT NULL,
  data_fim date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.promocoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own promocoes" ON public.promocoes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Logos Patrocinadores table
CREATE TABLE public.logos_patrocinadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  programa_id uuid NOT NULL REFERENCES public.programas(id) ON DELETE CASCADE,
  logo_url text NOT NULL DEFAULT '',
  data_final date NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.logos_patrocinadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own logos_patrocinadores" ON public.logos_patrocinadores FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Cron-like function: auto-delete expired testemunhais and promocoes, inactivate logos
CREATE OR REPLACE FUNCTION public.cleanup_comercial()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.testemunhais WHERE data_fim < CURRENT_DATE;
  DELETE FROM public.promocoes WHERE data_fim < CURRENT_DATE;
  UPDATE public.logos_patrocinadores SET ativo = false WHERE data_final < CURRENT_DATE AND ativo = true;
END;
$$;
