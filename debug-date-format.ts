import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qazvgmgdidjhbvcuinpy.supabase.co";
const SUPABASE_PUBLISHABLE_KEY =
  "sb_publishable_BzjxF3H_PSgFYVA3OQIaoA_Pytdg2V3";

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

async function testInsert() {
  console.log("Testing INSERT with cliente_desde as string date...\n");

  // Test 1: With valid ISO date
  console.log("1️⃣ Testing with ISO date (2024-01-15)...");
  const { error: e1 } = await supabase
    .from("empresa_config")
    .insert({
      user_id: "test-" + Date.now(),
      nome: "TEST 1 - ISO DATE",
      cliente_desde: "2024-01-15",
    });

  if (e1) {
    console.error("❌ Failed:", e1.code, e1.message);
  } else {
    console.log("✅ Success");
  }

  // Test 2: With empty string
  console.log("\n2️⃣ Testing with empty string...");
  const { error: e2 } = await supabase
    .from("empresa_config")
    .insert({
      user_id: "test-" + Date.now(),
      nome: "TEST 2 - EMPTY",
      cliente_desde: "",
    });

  if (e2) {
    console.error("❌ Failed:", e2.code, e2.message);
  } else {
    console.log("✅ Success");
  }

  // Test 3: With null
  console.log("\n3️⃣ Testing with null...");
  const { error: e3 } = await supabase
    .from("empresa_config")
    .insert({
      user_id: "test-" + Date.now(),
      nome: "TEST 3 - NULL",
      cliente_desde: null,
    });

  if (e3) {
    console.error("❌ Failed:", e3.code, e3.message);
  } else {
    console.log("✅ Success");
  }

  // Test 4: With text date format (like "15/01/2024")
  console.log("\n4️⃣ Testing with BR date format (15/01/2024)...");
  const { error: e4 } = await supabase
    .from("empresa_config")
    .insert({
      user_id: "test-" + Date.now(),
      nome: "TEST 4 - BR FORMAT",
      cliente_desde: "15/01/2024",
    });

  if (e4) {
    console.error("❌ Failed:", e4.code, e4.message);
  } else {
    console.log("✅ Success");
  }

  // Test 5: With just omitting the field
  console.log("\n5️⃣ Testing without cliente_desde field...");
  const { error: e5 } = await supabase.from("empresa_config").insert({
    user_id: "test-" + Date.now(),
    nome: "TEST 5 - OMITTED",
  });

  if (e5) {
    console.error("❌ Failed:", e5.code, e5.message);
  } else {
    console.log("✅ Success");
  }
}

testInsert().catch(console.error);
