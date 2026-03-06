ALTER TABLE public.empresa_config ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true;
ALTER TABLE public.empresa_config ADD COLUMN IF NOT EXISTS plano text NOT NULL DEFAULT 'basic';