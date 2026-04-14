CREATE TABLE public.custom_enquete_categories (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  nome TEXT NOT NULL,
  quizzes JSONB NOT NULL DEFAULT '[]'::jsonb,
  generated_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.custom_enquete_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own custom_enquete_categories"
  ON public.custom_enquete_categories
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);