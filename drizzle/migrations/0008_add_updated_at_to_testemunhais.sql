ALTER TABLE public.testemunhais ADD COLUMN IF NOT EXISTS updated_at timestamptz;
ALTER TABLE public.testemunhais ALTER COLUMN updated_at SET DEFAULT now();
DROP TRIGGER IF EXISTS update_testemunhais_updated_at ON public.testemunhais;
CREATE TRIGGER update_testemunhais_updated_at BEFORE UPDATE ON public.testemunhais FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();