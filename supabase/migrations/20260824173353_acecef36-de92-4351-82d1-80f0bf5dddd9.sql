ALTER TABLE public.sorteio_sorteios ADD COLUMN IF NOT EXISTS entrega_pin text;
UPDATE public.sorteio_sorteios SET entrega_pin = lpad((floor(random()*10000))::int::text, 4, '0') WHERE entrega_pin IS NULL;
ALTER TABLE public.sorteio_sorteios ALTER COLUMN entrega_pin SET DEFAULT lpad((floor(random()*10000))::int::text, 4, '0');