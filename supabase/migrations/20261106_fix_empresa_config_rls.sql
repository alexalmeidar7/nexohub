-- Enable RLS on empresa_config if not already enabled
ALTER TABLE empresa_config ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their own config" ON empresa_config;
DROP POLICY IF EXISTS "Users can update their own config" ON empresa_config;
DROP POLICY IF EXISTS "Users can insert their own config" ON empresa_config;

-- CREATE NEW POLICIES: Allow users to read, insert, and update their own config

-- 1. SELECT policy: Users can see their own empresa_config
CREATE POLICY "Users can view their own config"
ON empresa_config
FOR SELECT
USING (auth.uid() = user_id);

-- 2. INSERT policy: Users can create their own empresa_config
CREATE POLICY "Users can insert their own config"
ON empresa_config
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- 3. UPDATE policy: Users can update their own empresa_config
CREATE POLICY "Users can update their own config"
ON empresa_config
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- 4. (Optional) DELETE policy - disabled by default for safety
-- Users cannot delete their config, only update it
-- This prevents accidental data loss

-- Verify the policies were created
SELECT
  policyname,
  permissive,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'empresa_config'
ORDER BY policyname;
