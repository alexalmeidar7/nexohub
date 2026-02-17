
-- Events table
CREATE TABLE public.agenda_eventos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  programa_id UUID REFERENCES public.programas(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  local TEXT NOT NULL DEFAULT '',
  descricao TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agenda_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own agenda_eventos"
  ON public.agenda_eventos FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Participants table
CREATE TABLE public.agenda_participantes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  evento_id UUID NOT NULL REFERENCES public.agenda_eventos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  instagram TEXT DEFAULT '',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.agenda_participantes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own agenda_participantes"
  ON public.agenda_participantes FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
