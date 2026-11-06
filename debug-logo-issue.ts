import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qazvgmgdidjhbvcuinpy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_BzjxF3H_PSgFYVA3OQIaoA_Pytdg2V3";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function investigateLogo() {
  console.log("=== 1. Checking empresa_config table ===");
  const { data: allConfigs, error: e1 } = await supabase
    .from("empresa_config")
    .select("user_id, nome, logo, background_url, updated_at, created_at")
    .limit(5);

  if (e1) {
    console.error("❌ Error querying empresa_config:", e1);
  } else {
    console.log("✅ Total configs found:", allConfigs?.length);
    allConfigs?.forEach((config) => {
      console.log(
        `  - ${config.nome}: logo=${config.logo ? "EXISTS" : "NULL"}`
      );
    });
  }

  console.log("\n=== 2. Checking for Jornal FM ===");
  const jornal_uid = "98365ea6-0ebf-496d-83e9-69b38089586d";
  const { data: jornal, error: e2 } = await supabase
    .from("empresa_config")
    .select("*")
    .eq("user_id", jornal_uid)
    .maybeSingle();

  if (e2) {
    console.error("❌ Error querying Jornal FM:", e2);
  } else if (!jornal) {
    console.log("⚠️  Jornal FM not found in empresa_config");
  } else {
    console.log("✅ Jornal FM config found:");
    console.log(`  - Nome: ${jornal.nome}`);
    console.log(`  - Logo: ${jornal.logo ? "EXISTS" : "NULL"}`);
    console.log(`  - Updated: ${jornal.updated_at}`);
  }

  console.log("\n=== 3. Testing UPSERT ===");
  const testId = jornal_uid;
  const { data: upsertResult, error: e3 } = await supabase
    .from("empresa_config")
    .upsert(
      {
        user_id: testId,
        nome: "TEST LOGO UPDATE",
        logo: "https://example.com/test-logo-" + Date.now() + ".png",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    )
    .select();

  if (e3) {
    console.error(
      "❌ UPSERT failed:",
      e3.code,
      "-",
      e3.message,
      "\n  Details:",
      e3.details
    );
  } else {
    console.log("✅ UPSERT succeeded");
    console.log(
      `  - Inserted/Updated: ${upsertResult?.length} row(s)`
    );
    if (upsertResult && upsertResult[0]) {
      console.log(`  - New logo: ${upsertResult[0].logo}`);
    }
  }

  console.log("\n=== 4. Verify the update ===");
  const { data: verify, error: e4 } = await supabase
    .from("empresa_config")
    .select("user_id, nome, logo, updated_at")
    .eq("user_id", testId)
    .maybeSingle();

  if (e4) {
    console.error("❌ Verification failed:", e4);
  } else {
    console.log("✅ Current data in database:");
    console.log(`  - Nome: ${verify?.nome}`);
    console.log(`  - Logo: ${verify?.logo}`);
  }
}

investigateLogo().catch(console.error);
