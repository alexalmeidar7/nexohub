
-- Add numero_roteiro column
ALTER TABLE public.roteiros ADD COLUMN numero_roteiro integer;

-- Create a function to auto-assign the next global sequential number
CREATE OR REPLACE FUNCTION public.set_numero_roteiro()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.numero_roteiro IS NULL THEN
    SELECT COALESCE(MAX(numero_roteiro), 0) + 1 INTO NEW.numero_roteiro FROM public.roteiros;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger to auto-set numero on insert
CREATE TRIGGER trg_set_numero_roteiro
  BEFORE INSERT ON public.roteiros
  FOR EACH ROW
  EXECUTE FUNCTION public.set_numero_roteiro();

-- Backfill existing roteiros with sequential numbers
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
  FROM public.roteiros
  WHERE numero_roteiro IS NULL
)
UPDATE public.roteiros r SET numero_roteiro = n.rn
FROM numbered n WHERE r.id = n.id;
