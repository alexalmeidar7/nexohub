
-- House Mix baseline: core account, programming, schedule and commercial tables.
CREATE TABLE public.apresentadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL,
  cargo text DEFAULT '',
  instagram text DEFAULT '',
  foto text DEFAULT '',
  ativo boolean DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.programas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL,
  apresentador_id uuid REFERENCES public.apresentadores(id) ON DELETE SET NULL,
  selo text DEFAULT '',
  dias_semana text[] DEFAULT '{}',
  horario_inicio text NOT NULL,
  horario_fim text NOT NULL,
  estudio text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  ativo boolean NOT NULL DEFAULT true
);
CREATE TABLE public.agenda_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  programa_id uuid REFERENCES public.programas(id) ON DELETE CASCADE,
  data date NOT NULL,
  local text NOT NULL DEFAULT '',
  descricao text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  prioridade text NOT NULL DEFAULT 'normal',
  recorrencia text NOT NULL DEFAULT 'nenhuma'
);
CREATE TABLE public.agenda_participantes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evento_id uuid NOT NULL REFERENCES public.agenda_eventos(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  nome text NOT NULL,
  instagram text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.custom_news_sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  rss_url text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.selected_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  portal text NOT NULL,
  title text NOT NULL,
  image_url text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.selected_cotacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  value text NOT NULL,
  change text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.empresa_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  nome text DEFAULT '',
  logo text DEFAULT '',
  endereco text DEFAULT '',
  telefone_comercial text DEFAULT '',
  telefone_participacao text DEFAULT '',
  site text DEFAULT '',
  instagram text DEFAULT '',
  facebook text DEFAULT '',
  youtube text DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.user_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  music_xml_url text DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.escalada_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  portal text NOT NULL,
  title text NOT NULL,
  image_url text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
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
CREATE TABLE public.logos_patrocinadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  programa_id uuid NOT NULL REFERENCES public.programas(id) ON DELETE CASCADE,
  logo_url text NOT NULL DEFAULT '',
  data_final date NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
CREATE TABLE public.available_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text DEFAULT '',
  icon text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.client_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module_key text NOT NULL REFERENCES public.available_modules(key) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_key)
);
CREATE TABLE public.streaming_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  type text NOT NULL DEFAULT 'video',
  cover_url text DEFAULT '',
  background_url text DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  nome text,
  email text,
  cidade text,
  estado text,
  pais text,
  whatsapp text,
  sexo text,
  avatar_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.sub_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_user_id uuid NOT NULL,
  auth_user_id uuid NOT NULL UNIQUE,
  email text NOT NULL,
  nome text NOT NULL DEFAULT '',
  allowed_modules text[] NOT NULL DEFAULT '{}',
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enforce row-level isolation on all tenant-owned baseline tables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'apresentadores','programas','agenda_eventos','agenda_participantes',
    'custom_news_sites','selected_news','selected_cotacoes','empresa_config',
    'user_settings','escalada_news','testemunhais','promocoes',
    'logos_patrocinadores','client_modules','streaming_channels'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()))', 'tenant_owner_' || t, t);
  END LOOP;
END $$;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own roles" ON public.user_roles FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
ALTER TABLE public.available_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated read modules" ON public.available_modules FOR SELECT TO authenticated USING (true);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own profile" ON public.profiles FOR SELECT TO authenticated USING (user_id = (select auth.uid()));
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (user_id = (select auth.uid()));
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (user_id = (select auth.uid())) WITH CHECK (user_id = (select auth.uid()));
ALTER TABLE public.sub_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Parent manages subusers" ON public.sub_users FOR ALL TO authenticated USING (parent_user_id = (select auth.uid())) WITH CHECK (parent_user_id = (select auth.uid()));
CREATE POLICY "Subuser reads own mapping" ON public.sub_users FOR SELECT TO authenticated USING (auth_user_id = (select auth.uid()));
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
CREATE TRIGGER update_streaming_channels_updated_at BEFORE UPDATE ON public.streaming_channels FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
