
-- Tabela de produtos do Shopping
CREATE TABLE public.shopping_products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  program_id UUID REFERENCES public.programas(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  image_url TEXT DEFAULT '',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock INTEGER NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.shopping_products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own shopping_products"
  ON public.shopping_products FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Permitir leitura pública para exibição no player
CREATE POLICY "Anyone authenticated can view active products"
  ON public.shopping_products FOR SELECT
  USING (active = true AND stock > 0);

CREATE TRIGGER update_shopping_products_updated_at
  BEFORE UPDATE ON public.shopping_products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Tabela de Pre-Roll (Comercial)
CREATE TABLE public.comercial_preroll (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  video_url TEXT NOT NULL DEFAULT '',
  dias_semana TEXT[] DEFAULT '{}'::text[],
  horario_inicio TEXT NOT NULL,
  horario_fim TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  skip_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.comercial_preroll ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own comercial_preroll"
  ON public.comercial_preroll FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Permitir leitura pública para exibição no player
CREATE POLICY "Anyone authenticated can view active prerolls"
  ON public.comercial_preroll FOR SELECT
  USING (active = true);

CREATE TRIGGER update_comercial_preroll_updated_at
  BEFORE UPDATE ON public.comercial_preroll
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Bucket para vídeos de pre-roll
INSERT INTO storage.buckets (id, name, public) VALUES ('preroll', 'preroll', true);

-- Políticas de storage para preroll
CREATE POLICY "Users can upload preroll videos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'preroll' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view preroll videos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'preroll');

CREATE POLICY "Users can delete own preroll videos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'preroll' AND auth.uid() IS NOT NULL);

-- Bucket para imagens de produtos
INSERT INTO storage.buckets (id, name, public) VALUES ('shopping', 'shopping', true);

CREATE POLICY "Users can upload shopping images"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'shopping' AND auth.uid() IS NOT NULL);

CREATE POLICY "Anyone can view shopping images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'shopping');

CREATE POLICY "Users can delete own shopping images"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'shopping' AND auth.uid() IS NOT NULL);
