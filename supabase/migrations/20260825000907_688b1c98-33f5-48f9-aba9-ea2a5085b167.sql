ALTER TABLE public.custom_vmix_buttons ADD COLUMN IF NOT EXISTS estudio text;

CREATE TABLE public.vmix_switcher_categorias (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  estudio text,
  nome text NOT NULL DEFAULT 'Categoria',
  icone text,
  ordem integer NOT NULL DEFAULT 0,
  inputs jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vmix_switcher_categorias TO authenticated;
GRANT ALL ON public.vmix_switcher_categorias TO service_role;

ALTER TABLE public.vmix_switcher_categorias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own vmix categories"
ON public.vmix_switcher_categorias
FOR ALL
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_vmix_switcher_categorias_updated_at
BEFORE UPDATE ON public.vmix_switcher_categorias
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_vmix_switcher_categorias_user_estudio ON public.vmix_switcher_categorias (user_id, estudio);