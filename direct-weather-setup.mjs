/**
 * Direct setup of weather configuration using Supabase REST API
 * This uses the publishable key with a workaround to update user_settings
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qazvgmgdidjhbvcuinpy.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_BzjxF3H_PSgFYVA3OQIaoA_Pytdg2V3";

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const userId = "98365ea6-0ebf-496d-83e9-69b38089586d"; // Jornal FM / Transmissão

async function setupWeather() {
  try {
    console.log("🌦️  Setting up weather configuration for Jornal FM...\n");

    // Try to update user_settings (this might require authentication)
    const { error } = await sb
      .from("user_settings")
      .upsert({
        user_id: userId,
        weather_city: "Goiânia",
        weather_lat: -15.7942,
        weather_lon: -48.0676,
      })
      .eq("user_id", userId);

    if (error) {
      console.error("❌ Error updating user_settings:", error.message);
      console.log("\n⚠️  This is expected - the publishable key doesn't have UPDATE permission");
      console.log("   on user_settings without authentication.\n");
      
      // Show the manual SQL option
      showManualOption();
    } else {
      console.log("✅ Weather settings updated successfully!");
      console.log("   City: Goiânia");
      console.log("   Coordinates: -15.7942, -48.0676\n");
      
      // Verify it was saved
      const { data } = await sb
        .from("user_settings")
        .select("weather_city, weather_lat, weather_lon")
        .eq("user_id", userId)
        .maybeSingle();
      
      if (data) {
        console.log("✅ Verified - Settings saved:");
        console.log(JSON.stringify(data, null, 2));
      }
    }
  } catch (e) {
    console.error("Fatal error:", e);
    showManualOption();
  }
}

function showManualOption() {
  console.log("\n" + "=".repeat(70));
  console.log("📝 ALTERNATIVE: Execute this SQL directly\n");
  console.log("=".repeat(70) + "\n");
  
  const sql = `
-- Setup weather for Jornal FM
INSERT INTO public.user_settings (user_id, weather_city, weather_lat, weather_lon)
VALUES ('98365ea6-0ebf-496d-83e9-69b38089586d', 'Goiânia', -15.7942, -48.0676)
ON CONFLICT (user_id) DO UPDATE SET
  weather_city = 'Goiânia',
  weather_lat = -15.7942,
  weather_lon = -48.0676;
`;

  console.log(sql);
  console.log("=".repeat(70));
  console.log("\n📍 Go to: https://supabase.com/dashboard/project/qazvgmgdidjhbvcuinpy/sql/new");
  console.log("📋 Copy the SQL above");
  console.log("▶️  Run it in the SQL Editor");
  console.log("✅ Done! The weather XML will be generated in 10 minutes\n");
}

setupWeather();
