/**
 * Check what weather settings were actually saved
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://qazvgmgdidjhbvcuinpy.supabase.co";
const apiKey = "sb_publishable_BzjxF3H_PSgFYVA3OQIaoA_Pytdg2V3";

const sb = createClient(supabaseUrl, apiKey);

const userId = "98365ea6-0ebf-496d-83e9-69b38089586d";

async function checkWeatherSettings() {
  console.log("🔍 Checking weather settings in database...\n");

  try {
    const { data, error } = await sb
      .from("user_settings")
      .select("*")
      .eq("user_id", userId);

    if (error) {
      console.error("❌ Error:", error.message);
      return;
    }

    if (!data || data.length === 0) {
      console.log("❌ No user_settings found for this user\n");
      return;
    }

    const settings = data[0];
    console.log("✅ User settings found:\n");
    console.log(`   user_id: ${settings.user_id}`);
    console.log(`   weather_city: "${settings.weather_city}"`);
    console.log(`   weather_lat: ${settings.weather_lat}`);
    console.log(`   weather_lon: ${settings.weather_lon}`);
    console.log(`   created_at: ${settings.created_at}`);
    console.log(`   updated_at: ${settings.updated_at}\n`);

    if (!settings.weather_city || settings.weather_city === "") {
      console.log("⚠️  weather_city is empty or null!");
      console.log("   The update-weather-xml function won't process this user.\n");
      console.log("   Solution: Set weather_city to a valid city name\n");
    }
  } catch (e) {
    console.error("Error:", e.message);
  }
}

checkWeatherSettings();
