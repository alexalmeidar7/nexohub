
-- Add variavel flag and specific date for variable programs
ALTER TABLE public.programas ADD COLUMN variavel boolean NOT NULL DEFAULT false;
ALTER TABLE public.programas ADD COLUMN data_variavel date NULL;
