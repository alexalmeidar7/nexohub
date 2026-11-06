import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qazvgmgdidjhbvcuinpy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_BzjxF3H_PSgFYVA3OQIaoA_Pytdg2V3";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

const TEST_UUID = "98365ea6-0ebf-496d-83e9-69b38089586d";

async function testAfterRLSFix() {
  console.log(
    "🔍 Testing LOGO SAVE after RLS policy fix\n"
  );

  // Test 1: with null date
  console.log("1️⃣ Test: UPSERT with null cliente_desde...");
  const { data: test1, error: e1 } = await supabase
    .from("empresa_config")
    .upsert({
      user_id: TEST_UUID,
      nome: "JORNAL FM - TEST",
      logo: `https://example.com/logo-${Date.now()}.png`,
      cliente_desde: null,
      updated_at: new Date().toISOString(),
    })
    .select();

  if (e1) {
    console.error(`❌ Failed: ${e1.code} - ${e1.message}`);
  } else {
    console.log("✅ Success!");
    console.log(`  - Nome: ${test1?.[0]?.nome}`);
    console.log(`  - Logo: ${test1?.[0]?.logo}`);
  }

  // Test 2: with valid ISO date
  console.log("\n2️⃣ Test: UPSERT with valid ISO date...");
  const { data: test2, error: e2 } = await supabase
    .from("empresa_config")
    .upsert({
      user_id: TEST_UUID,
      nome: "JORNAL FM - WITH DATE",
      logo: `https://example.com/logo-with-date-${Date.now()}.png`,
      cliente_desde: "2024-01-15",
      updated_at: new Date().toISOString(),
    })
    .select();

  if (e2) {
    console.error(`❌ Failed: ${e2.code} - ${e2.message}`);
  } else {
    console.log("✅ Success!");
    console.log(`  - Cliente desde: ${test2?.[0]?.cliente_desde}`);
  }

  // Test 3: Verify read
  console.log("\n3️⃣ Test: SELECT to verify...");
  const { data: verify, error: e3 } = await supabase
    .from("empresa_config")
    .select("user_id, nome, logo, cliente_desde, updated_at")
    .eq("user_id", TEST_UUID)
    .maybeSingle();

  if (e3) {
    console.error(`❌ Failed: ${e3.code} - ${e3.message}`);
  } else {
    console.log("✅ Data persisted to database:");
    console.log(`  - Nome: ${verify?.nome}`);
    console.log(`  - Logo: ${verify?.logo}`);
    console.log(`  - Cliente desde: ${verify?.cliente_desde || "NULL"}`);
    console.log(`  - Updated at: ${verify?.updated_at}`);
  }

  console.log("\n✨ All tests completed!");
}

testAfterRLSFix().catch(console.error);
