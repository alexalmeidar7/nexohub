import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qazvgmgdidjhbvcuinpy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_BzjxF3H_PSgFYVA3OQIaoA_Pytdg2V3";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// Valid UUID for testing
const TEST_UUID = "98365ea6-0ebf-496d-83e9-69b38089586d";

async function testNullDate() {
  console.log("Testing UPSERT with cliente_desde: null\n");

  const { data, error } = await supabase
    .from("empresa_config")
    .upsert({
      user_id: TEST_UUID,
      nome: "TEST - NULL DATE FIX",
      logo: "https://example.com/logo-test-" + Date.now() + ".png",
      cliente_desde: null, // Send null instead of empty string
      updated_at: new Date().toISOString(),
    })
    .select();

  if (error) {
    console.error(
      "❌ UPSERT failed:",
      error.code,
      "-",
      error.message
    );
    console.log("Details:", error.details);
  } else {
    console.log("✅ UPSERT succeeded!");
    console.log("Saved data:", data);
  }
}

testNullDate().catch(console.error);
