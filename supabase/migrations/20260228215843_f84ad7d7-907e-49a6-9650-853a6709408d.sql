
-- Enum for roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- User roles table
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function to check roles (avoids recursive RLS)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS: users see own roles, admins see all
CREATE POLICY "Users can view own roles"
ON public.user_roles FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all roles"
ON public.user_roles FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can manage roles"
ON public.user_roles FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Available modules definition
CREATE TABLE public.available_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  name text NOT NULL,
  description text DEFAULT '',
  icon text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.available_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read modules"
ON public.available_modules FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage modules"
ON public.available_modules FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Seed default modules
INSERT INTO public.available_modules (key, name, description, icon) VALUES
  ('previsao', 'Módulo Previsão do Tempo', 'Previsão do tempo com favoritos e XML', 'Sun'),
  ('noticias', 'Módulo Notícias', 'Painel de notícias e cotações', 'FileText'),
  ('apresentadores', 'Módulo Cadastro de Apresentadores/Participantes', 'Gestão de apresentadores', 'Mic2'),
  ('programas', 'Módulo Cadastro de Programas', 'Grade de programação', 'PlaySquare'),
  ('musica', 'Módulo Música no Ar', 'Música tocando agora', 'Music'),
  ('agenda', 'Módulo Agenda', 'Agenda de eventos', 'CalendarDays'),
  ('comercial', 'Módulo Comercial', 'Testemunhais, Promoções e Logos', 'ShoppingBag');

-- Client module assignments
CREATE TABLE public.client_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module_key text NOT NULL REFERENCES public.available_modules(key) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_key)
);
ALTER TABLE public.client_modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own modules"
ON public.client_modules FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage client modules"
ON public.client_modules FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Streaming channels
CREATE TABLE public.streaming_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  url text NOT NULL,
  type text NOT NULL DEFAULT 'video', -- 'video', 'audio', 'youtube'
  cover_url text DEFAULT '',
  background_url text DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.streaming_channels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own channels"
ON public.streaming_channels FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all channels"
ON public.streaming_channels FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Trigger for updated_at on streaming_channels
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_streaming_channels_updated_at
BEFORE UPDATE ON public.streaming_channels
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
