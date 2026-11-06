import fetch from "node-fetch";

const SUPABASE_URL = "https://qazvgmgdidjhbvcuinpy.supabase.co";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error(
    "❌ SUPABASE_SERVICE_ROLE_KEY not set. Set it via:\nset SUPABASE_SERVICE_ROLE_KEY=your_key"
  );
  process.exit(1);
}

async function fixRLS() {
  console.log("🔧 Fixing empresa_config RLS policies...\n");

  const sql = `
-- Enable RLS on empresa_config
ALTER TABLE empresa_config ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view their own config" ON empresa_config;
DROP POLICY IF EXISTS "Users can update their own config" ON empresa_config;
DROP POLICY IF EXISTS "Users can insert their own config" ON empresa_config;

-- SELECT policy
CREATE POLICY "Users can view their own config"
ON empresa_config
FOR SELECT
USING (auth.uid() = user_id);

-- INSERT policy
CREATE POLICY "Users can insert their own config"
ON empresa_config
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- UPDATE policy
CREATE POLICY "Users can update their own config"
ON empresa_config
FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Verify
SELECT policyname, permissive FROM pg_policies WHERE tablename = 'empresa_config';
`;

  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/rpc/sql`,
      {
        method: "POST",
        headers: {
          "apikey": SERVICE_ROLE_KEY,
          "Authorization": `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("❌ Error:", data);
    } else {
      console.log("✅ RLS policies fixed!");
      console.log("Response:", data);
    }
  } catch (error) {
    console.error("Fatal error:", error);
  }
}

fixRLS();
