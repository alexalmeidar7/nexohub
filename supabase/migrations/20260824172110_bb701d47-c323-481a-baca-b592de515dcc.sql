ALTER TABLE public.sorteio_sorteios
  ADD COLUMN IF NOT EXISTS entrega_token uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS foto_entrega_url text,
  ADD COLUMN IF NOT EXISTS entrega_registrada_em timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS sorteio_sorteios_entrega_token_key ON public.sorteio_sorteios(entrega_token);