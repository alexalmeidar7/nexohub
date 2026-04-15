
CREATE TABLE public.programa_automacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  programa_id UUID REFERENCES public.programas(id) ON DELETE CASCADE NOT NULL,
  sites_source TEXT[] NOT NULL DEFAULT '{}',
  use_custom_news_sites BOOLEAN NOT NULL DEFAULT true,
  briefing TEXT NOT NULL DEFAULT '',
  dias_semana TEXT[] NOT NULL DEFAULT '{}',
  horario TEXT NOT NULL DEFAULT '08:00',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.programa_automacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own programa_automacoes" ON public.programa_automacoes
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Sub-users can view parent programa_automacoes" ON public.programa_automacoes
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM sub_users
    WHERE sub_users.auth_user_id = auth.uid()
      AND sub_users.parent_user_id = programa_automacoes.user_id
      AND sub_users.ativo = true
  ));

CREATE TRIGGER update_programa_automacoes_updated_at
  BEFORE UPDATE ON public.programa_automacoes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
