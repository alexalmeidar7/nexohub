-- Remove programs associated with 'FM' studio specifically if the user wants it gone
DELETE FROM public.programas WHERE estudio = 'FM';

-- Also handle variations if necessary, but according to request "FM" is the target.
-- To be safe and clean up, we can also nullify studio for others or delete them.
-- DELETE FROM public.programas WHERE estudio = 'Estudio FM';

-- Ensure RLS allows deletion of programs by the owner
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'programas' 
        AND policyname = 'Users can delete their own programs'
    ) THEN
        CREATE POLICY "Users can delete their own programs" 
        ON public.programas 
        FOR DELETE 
        USING (auth.uid() = user_id);
    END IF;
END $$;
