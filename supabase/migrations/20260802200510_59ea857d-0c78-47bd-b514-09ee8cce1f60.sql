ALTER TABLE public.empresa_config 
ADD COLUMN IF NOT EXISTS cnpj TEXT,
ADD COLUMN IF NOT EXISTS cliente_desde DATE,
ADD COLUMN IF NOT EXISTS executiva_venda TEXT;

-- Create a table for client actions history (blitz, insertions, site ads, etc)
CREATE TABLE public.client_actions_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  client_id UUID NOT NULL, -- The specific client name/ref this action is about
  action_type TEXT NOT NULL, -- 'blitz', 'insertion', 'site_ad', 'player', etc
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_actions_history TO authenticated;
GRANT ALL ON public.client_actions_history TO service_role;

ALTER TABLE public.client_actions_history ENABLE ROW LEVEL SECURITY;

-- Admins can manage all, users manage their own (if applicable, though this is mostly for admin view)
CREATE POLICY "Admins can manage all client actions"
  ON public.client_actions_history FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users view own actions"
  ON public.client_actions_history FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);
