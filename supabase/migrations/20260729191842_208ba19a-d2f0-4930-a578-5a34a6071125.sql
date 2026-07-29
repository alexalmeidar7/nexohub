CREATE TABLE public.client_trash (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  email text,
  nome text,
  deleted_by uuid,
  deleted_at timestamp with time zone NOT NULL DEFAULT now(),
  purge_at timestamp with time zone NOT NULL DEFAULT (now() + interval '60 days'),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_trash TO authenticated;
GRANT ALL ON public.client_trash TO service_role;

ALTER TABLE public.client_trash ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage client trash"
ON public.client_trash FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_client_trash_updated_at
BEFORE UPDATE ON public.client_trash
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();