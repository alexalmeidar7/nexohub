
ALTER TABLE public.sorteio_premios
  ADD COLUMN IF NOT EXISTS programa_id uuid REFERENCES public.programas(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS dias_validade integer NOT NULL DEFAULT 7;

ALTER TABLE public.sorteio_sorteios
  ADD COLUMN IF NOT EXISTS expirado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS data_expiracao timestamptz;

CREATE OR REPLACE FUNCTION public.expire_overdue_sorteios(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  cnt integer := 0;
BEGIN
  FOR r IN
    SELECT s.id, s.premio_id, s.observacoes, COALESCE(p.dias_validade, 7) AS dias
      FROM public.sorteio_sorteios s
      JOIN public.sorteio_premios p ON p.id = s.premio_id
     WHERE s.user_id = _user_id
       AND s.entregue = false
       AND s.expirado = false
       AND s.data_sorteio + (COALESCE(p.dias_validade, 7) || ' days')::interval < now()
  LOOP
    UPDATE public.sorteio_sorteios
       SET expirado = true,
           data_expiracao = now(),
           observacoes = COALESCE(observacoes || E'\n', '') || '[PRÊMIO NÃO RETIRADO no prazo de ' || r.dias || ' dias — devolvido ao estoque]'
     WHERE id = r.id;

    UPDATE public.sorteio_premios
       SET quantidade_estoque = quantidade_estoque + 1
     WHERE id = r.premio_id;

    cnt := cnt + 1;
  END LOOP;
  RETURN cnt;
END;
$$;

GRANT EXECUTE ON FUNCTION public.expire_overdue_sorteios(uuid) TO authenticated, service_role;
