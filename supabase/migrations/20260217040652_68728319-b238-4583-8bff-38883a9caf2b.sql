
-- Apresentadores
CREATE TABLE public.apresentadores (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  cargo TEXT DEFAULT '',
  instagram TEXT DEFAULT '',
  foto TEXT DEFAULT '',
  ativo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.apresentadores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own apresentadores" ON public.apresentadores FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Programas
CREATE TABLE public.programas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  apresentador_id UUID REFERENCES public.apresentadores(id) ON DELETE SET NULL,
  selo TEXT DEFAULT '',
  dias_semana TEXT[] DEFAULT '{}',
  horario_inicio TEXT NOT NULL,
  horario_fim TEXT NOT NULL,
  estudio TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.programas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own programas" ON public.programas FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Custom news sites
CREATE TABLE public.custom_news_sites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  rss_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.custom_news_sites ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own custom_news_sites" ON public.custom_news_sites FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Selected news
CREATE TABLE public.selected_news (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  portal TEXT NOT NULL,
  title TEXT NOT NULL,
  image_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.selected_news ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own selected_news" ON public.selected_news FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Selected cotacoes
CREATE TABLE public.selected_cotacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  value TEXT NOT NULL,
  change TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.selected_cotacoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own selected_cotacoes" ON public.selected_cotacoes FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Empresa config
CREATE TABLE public.empresa_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  nome TEXT DEFAULT '',
  logo TEXT DEFAULT '',
  endereco TEXT DEFAULT '',
  telefone_comercial TEXT DEFAULT '',
  telefone_participacao TEXT DEFAULT '',
  site TEXT DEFAULT '',
  instagram TEXT DEFAULT '',
  facebook TEXT DEFAULT '',
  youtube TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.empresa_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own empresa_config" ON public.empresa_config FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- User settings (music xml url, etc)
CREATE TABLE public.user_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  music_xml_url TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own settings" ON public.user_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
