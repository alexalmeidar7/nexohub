
CREATE TABLE public.sorteio_premios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL,
  descricao text,
  imagem_url text,
  quantidade_estoque integer NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sorteio_premios TO authenticated;
GRANT ALL ON public.sorteio_premios TO service_role;

ALTER TABLE public.sorteio_premios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master manage own premios"
ON public.sorteio_premios FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Sub-users manage master premios"
ON public.sorteio_premios FOR ALL TO authenticated
USING (user_id IN (SELECT parent_user_id FROM public.sub_users WHERE auth_user_id = auth.uid()))
WITH CHECK (user_id IN (SELECT parent_user_id FROM public.sub_users WHERE auth_user_id = auth.uid()));

CREATE TRIGGER update_sorteio_premios_updated_at
BEFORE UPDATE ON public.sorteio_premios
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.sorteio_sorteios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  premio_id uuid NOT NULL REFERENCES public.sorteio_premios(id) ON DELETE CASCADE,
  ouvinte_id uuid REFERENCES public.ouvintes(id) ON DELETE SET NULL,
  nome_ganhador text NOT NULL,
  telefone_ganhador text,
  data_sorteio timestamptz NOT NULL DEFAULT now(),
  entregue boolean NOT NULL DEFAULT false,
  data_entrega timestamptz,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sorteio_sorteios TO authenticated;
GRANT ALL ON public.sorteio_sorteios TO service_role;

ALTER TABLE public.sorteio_sorteios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Master manage own sorteios"
ON public.sorteio_sorteios FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Sub-users manage master sorteios"
ON public.sorteio_sorteios FOR ALL TO authenticated
USING (user_id IN (SELECT parent_user_id FROM public.sub_users WHERE auth_user_id = auth.uid()))
WITH CHECK (user_id IN (SELECT parent_user_id FROM public.sub_users WHERE auth_user_id = auth.uid()));

CREATE TRIGGER update_sorteio_sorteios_updated_at
BEFORE UPDATE ON public.sorteio_sorteios
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.handle_sorteio_entrega_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.entregue = true THEN
      UPDATE public.sorteio_premios
         SET quantidade_estoque = GREATEST(quantidade_estoque - 1, 0)
       WHERE id = NEW.premio_id;
      IF NEW.data_entrega IS NULL THEN NEW.data_entrega := now(); END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.entregue, false) = false AND NEW.entregue = true THEN
      UPDATE public.sorteio_premios
         SET quantidade_estoque = GREATEST(quantidade_estoque - 1, 0)
       WHERE id = NEW.premio_id;
      IF NEW.data_entrega IS NULL THEN NEW.data_entrega := now(); END IF;
    ELSIF COALESCE(OLD.entregue, false) = true AND NEW.entregue = false THEN
      UPDATE public.sorteio_premios
         SET quantidade_estoque = quantidade_estoque + 1
       WHERE id = NEW.premio_id;
      NEW.data_entrega := NULL;
    END IF;
    RETURN NEW;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sorteio_entrega_stock
BEFORE INSERT OR UPDATE ON public.sorteio_sorteios
FOR EACH ROW EXECUTE FUNCTION public.handle_sorteio_entrega_stock();
