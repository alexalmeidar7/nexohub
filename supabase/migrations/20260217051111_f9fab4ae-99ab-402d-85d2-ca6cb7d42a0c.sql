
ALTER TABLE public.agenda_eventos 
ADD COLUMN recorrencia TEXT NOT NULL DEFAULT 'unico';
-- Values: 'unico', 'semanal', 'mensal'
