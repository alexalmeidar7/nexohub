
-- site_config
CREATE TABLE public.site_config (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  site_nome TEXT NOT NULL DEFAULT 'Meu Site',
  site_descricao TEXT DEFAULT '',
  cor_primaria TEXT DEFAULT '#268ffa',
  show_no_ar BOOLEAN NOT NULL DEFAULT true,
  show_noticias BOOLEAN NOT NULL DEFAULT true,
  show_clima BOOLEAN NOT NULL DEFAULT true,
  show_economia BOOLEAN NOT NULL DEFAULT true,
  show_promocoes BOOLEAN NOT NULL DEFAULT true,
  show_grade BOOLEAN NOT NULL DEFAULT true,
  fonte_noticias TEXT NOT NULL DEFAULT 'roteiro' CHECK (fonte_noticias IN ('roteiro','manual')),
  cidade_clima TEXT DEFAULT '',
  cidade_lat DOUBLE PRECISION,
  cidade_lon DOUBLE PRECISION,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_config TO authenticated;
GRANT SELECT ON public.site_config TO anon;
GRANT ALL ON public.site_config TO service_role;
ALTER TABLE public.site_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_config public read" ON public.site_config FOR SELECT USING (true);
CREATE POLICY "site_config owner manage" ON public.site_config FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_site_config_updated_at BEFORE UPDATE ON public.site_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- site_categorias
CREATE TABLE public.site_categorias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  slug TEXT NOT NULL,
  cor TEXT DEFAULT '#268ffa',
  ordem INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, slug)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_categorias TO authenticated;
GRANT SELECT ON public.site_categorias TO anon;
GRANT ALL ON public.site_categorias TO service_role;
ALTER TABLE public.site_categorias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_categorias public read" ON public.site_categorias FOR SELECT USING (true);
CREATE POLICY "site_categorias owner manage" ON public.site_categorias FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- site_noticias
CREATE TABLE public.site_noticias (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  categoria_id UUID REFERENCES public.site_categorias(id) ON DELETE SET NULL,
  titulo TEXT NOT NULL,
  resumo TEXT DEFAULT '',
  conteudo TEXT DEFAULT '',
  imagem_url TEXT DEFAULT '',
  publicado BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_noticias TO authenticated;
GRANT SELECT ON public.site_noticias TO anon;
GRANT ALL ON public.site_noticias TO service_role;
ALTER TABLE public.site_noticias ENABLE ROW LEVEL SECURITY;
CREATE POLICY "site_noticias public read" ON public.site_noticias FOR SELECT USING (publicado = true OR auth.uid() = user_id);
CREATE POLICY "site_noticias owner manage" ON public.site_noticias FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_site_noticias_updated_at BEFORE UPDATE ON public.site_noticias FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX idx_site_noticias_user_pub ON public.site_noticias(user_id, publicado, created_at DESC);
