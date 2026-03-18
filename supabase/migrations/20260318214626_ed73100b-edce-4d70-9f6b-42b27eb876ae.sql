CREATE TABLE public.preset_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  programa_id uuid NOT NULL,
  commands jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, programa_id)
);

ALTER TABLE public.preset_commands ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own preset commands"
  ON public.preset_commands
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_preset_commands_updated_at
  BEFORE UPDATE ON public.preset_commands
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();