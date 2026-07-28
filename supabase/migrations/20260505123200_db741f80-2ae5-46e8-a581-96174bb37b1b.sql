ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS journalistic_prompt TEXT;

-- Update RLS policies (usually profiles already has them, but ensure user can update own profile)
-- Most templates have a policy like "Users can update their own profile"
DO $$ 
BEGIN 
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' AND policyname = 'Users can update their own profile'
    ) THEN
        CREATE POLICY "Users can update their own profile" ON public.profiles
        FOR UPDATE USING (auth.uid() = user_id);
    END IF;
END $$;
