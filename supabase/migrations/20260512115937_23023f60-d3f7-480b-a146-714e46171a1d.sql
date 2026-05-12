-- Add ai_enabled column to profiles if it doesn't exist
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN DEFAULT true;

-- Update existing profiles to have it enabled initially
UPDATE public.profiles SET ai_enabled = true WHERE ai_enabled IS NULL;

-- Enable RLS for profiles (likely already enabled, but for safety)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policy for users to see their own profile data (including ai_enabled)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'profiles' AND policyname = 'Users can view their own profile'
    ) THEN
        CREATE POLICY "Users can view their own profile" ON public.profiles
        FOR SELECT USING (auth.uid() = user_id);
    END IF;
END $$;
