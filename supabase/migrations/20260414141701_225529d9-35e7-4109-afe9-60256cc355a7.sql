
-- Sub-users table: links a parent account to sub-user accounts with module permissions
CREATE TABLE public.sub_users (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_user_id UUID NOT NULL,
  auth_user_id UUID NOT NULL,
  email TEXT NOT NULL,
  nome TEXT NOT NULL DEFAULT '',
  allowed_modules TEXT[] NOT NULL DEFAULT '{}',
  ativo BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint: one sub-user per auth account per parent
ALTER TABLE public.sub_users ADD CONSTRAINT sub_users_auth_user_id_key UNIQUE (auth_user_id);

-- RLS
ALTER TABLE public.sub_users ENABLE ROW LEVEL SECURITY;

-- Parent can manage their sub-users
CREATE POLICY "Parents manage own sub_users"
  ON public.sub_users FOR ALL
  TO authenticated
  USING (auth.uid() = parent_user_id)
  WITH CHECK (auth.uid() = parent_user_id);

-- Sub-users can read their own record
CREATE POLICY "Sub-users can view own record"
  ON public.sub_users FOR SELECT
  TO authenticated
  USING (auth.uid() = auth_user_id);

-- Updated_at trigger
CREATE TRIGGER update_sub_users_updated_at
  BEFORE UPDATE ON public.sub_users
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
