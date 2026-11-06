const serve = Deno.serve;
import { createClient } from "npm:@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: { "Access-Control-Allow-Origin": "*" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create admin client
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    console.log("🔧 === FIXING EMPRESA_CONFIG RLS ===");

    // Execute the SQL directly
    const sqlStatements = [
      "ALTER TABLE empresa_config ENABLE ROW LEVEL SECURITY;",
      'DROP POLICY IF EXISTS "Users can view their own config" ON empresa_config;',
      'DROP POLICY IF EXISTS "Users can update their own config" ON empresa_config;',
      'DROP POLICY IF EXISTS "Users can insert their own config" ON empresa_config;',
      `CREATE POLICY "Users can view their own config"
       ON empresa_config FOR SELECT
       USING (auth.uid() = user_id);`,
      `CREATE POLICY "Users can insert their own config"
       ON empresa_config FOR INSERT
       WITH CHECK (auth.uid() = user_id);`,
      `CREATE POLICY "Users can update their own config"
       ON empresa_config FOR UPDATE
       USING (auth.uid() = user_id)
       WITH CHECK (auth.uid() = user_id);`,
    ];

    let results: any[] = [];

    for (const sql of sqlStatements) {
      console.log(`Executing: ${sql.substring(0, 50)}...`);
      const { data, error } = await admin.rpc("exec_sql", { sql });

      if (error) {
        console.error(`❌ Error: ${error.message}`);
        results.push({ sql: sql.substring(0, 50), error: error.message });
      } else {
        console.log("✅ Success");
        results.push({ sql: sql.substring(0, 50), success: true });
      }
    }

    // Verify policies
    console.log("\n📋 Verifying policies...");
    const { data: policies, error: policiesErr } = await admin
      .rpc("show_rls_policies", { table_name: "empresa_config" });

    if (policiesErr) {
      console.warn("Could not verify (RPC may not exist)");
    } else {
      console.log("Policies after fix:", policies);
    }

    return new Response(
      JSON.stringify({
        status: "completed",
        message: "RLS policies fixed for empresa_config",
        results,
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Fatal error:", error);
    return new Response(
      JSON.stringify({
        status: "error",
        message: String(error),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
