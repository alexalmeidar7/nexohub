
CREATE TABLE public.quiz_agendados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  pergunta text NOT NULL DEFAULT '',
  resposta1 text NOT NULL DEFAULT '',
  resposta2 text NOT NULL DEFAULT '',
  resposta3 text NOT NULL DEFAULT '',
  resposta4 text NOT NULL DEFAULT '',
  resposta_correta integer NOT NULL DEFAULT 1,
  data_quiz date NOT NULL,
  horario_inicio text NOT NULL,
  horario_fim text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.quiz_agendados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own quiz_agendados" ON public.quiz_agendados
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Sub-users can view parent quiz_agendados" ON public.quiz_agendados
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM sub_users
    WHERE sub_users.auth_user_id = auth.uid()
      AND sub_users.parent_user_id = quiz_agendados.user_id
      AND sub_users.ativo = true
  ));

CREATE TABLE public.custom_quiz_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  nome text NOT NULL,
  quizzes jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_quiz_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own custom_quiz_categories" ON public.custom_quiz_categories
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Sub-users can view parent custom_quiz_categories" ON public.custom_quiz_categories
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM sub_users
    WHERE sub_users.auth_user_id = auth.uid()
      AND sub_users.parent_user_id = custom_quiz_categories.user_id
      AND sub_users.ativo = true
  ));
