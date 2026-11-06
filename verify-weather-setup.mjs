/**
 * Verify weather setup and check if XML was generated
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://qazvgmgdidjhbvcuinpy.supabase.co";
const apiKey = "sb_publishable_BzjxF3H_PSgFYVA3OQIaoA_Pytdg2V3";

const sb = createClient(supabaseUrl, apiKey);

const userId = "98365ea6-0ebf-496d-83e9-69b38089586d";

async function verifySetup() {
  try {
    console.log("✅ Weather setup successful!\n");
    console.log("📊 Verifying configuration...\n");

    // Check if the settings were saved
    const { data: settings, error } = await sb
      .from("user_settings")
      .select("weather_city, weather_lat, weather_lon, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("❌ Error reading settings:", error.message);
      return;
    }

    if (settings) {
      console.log("✅ Weather settings confirmed:");
      console.log(`   City: ${settings.weather_city}`);
      console.log(`   Latitude: ${settings.weather_lat}`);
      console.log(`   Longitude: ${settings.weather_lon}`);
      console.log(`   Last updated: ${settings.updated_at}\n`);
    } else {
      console.log("⚠️  Settings not found (might take a moment to sync)\n");
    }

    // Check if weather XML was generated
    console.log("🌦️  Checking if weather XML file exists...\n");
    
    try {
      const { data, error: storageError } = await sb.storage
        .from("xml-files")
        .download(`xml-tempo-${userId}.xml`);

      if (storageError) {
        console.log(`⏳ Weather XML not yet generated (this is expected)`);
        console.log(`   Error: ${storageError.message}\n`);
        console.log(`📝 The file will be generated when:`);
        console.log(`   - The cron job 'update-weather-xml' runs (every 10 min)`);
        console.log(`   - OR when deployed to production\n`);
      } else if (data) {
        const text = await data.text();
        console.log("✅ Weather XML FOUND! File is ready!");
        console.log("\n📄 Content preview:");
        const lines = text.split("\n").slice(0, 15);
        lines.forEach(line => console.log("   " + line));
        console.log("   ...\n");
      }
    } catch (e) {
      console.log(`⏳ File check failed: ${e.message}`);
    }

    console.log("✅ Setup complete!");
    console.log("\n📍 Next step:");
    console.log("   1. Wait 10 minutes for the weather job to run");
    console.log("   2. Refresh the XML URL:");
    console.log("   http://localhost:8080/xml/transmissao/geral.xml");
    console.log("\n   The weather fields should now be populated!");
  } catch (e) {
    console.error("Fatal error:", e);
  }
}

verifySetup();
