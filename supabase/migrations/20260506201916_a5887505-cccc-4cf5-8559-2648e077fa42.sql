CREATE POLICY "Mockups can be inserted by authenticated users" 
ON public.comercial_mockups 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Mockups can be updated by authenticated users" 
ON public.comercial_mockups 
FOR UPDATE 
USING (auth.role() = 'authenticated');