-- Add INSERT policy for sub-users on testemunhais
CREATE POLICY "Sub-users can insert parent testemunhais" 
ON public.testemunhais 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sub_users 
    WHERE sub_users.auth_user_id = auth.uid() 
    AND sub_users.parent_user_id = testemunhais.user_id 
    AND sub_users.ativo = true
  )
);

-- Add UPDATE policy for sub-users on testemunhais
CREATE POLICY "Sub-users can update parent testemunhais" 
ON public.testemunhais 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.sub_users 
    WHERE sub_users.auth_user_id = auth.uid() 
    AND sub_users.parent_user_id = testemunhais.user_id 
    AND sub_users.ativo = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sub_users 
    WHERE sub_users.auth_user_id = auth.uid() 
    AND sub_users.parent_user_id = testemunhais.user_id 
    AND sub_users.ativo = true
  )
);

-- Add DELETE policy for sub-users on testemunhais
CREATE POLICY "Sub-users can delete parent testemunhais" 
ON public.testemunhais 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.sub_users 
    WHERE sub_users.auth_user_id = auth.uid() 
    AND sub_users.parent_user_id = testemunhais.user_id 
    AND sub_users.ativo = true
  )
);
