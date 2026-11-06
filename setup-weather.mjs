/**
 * Generate weather XML files for all stations
 * Run with: npx @supabase/supabase-js test-generate-weather.ts
 * Or invoke the Edge Function: POST http://localhost:54321/functions/v1/update-weather-xml
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  console.log("\nTo fix this:");
  console.log("1. Run: supabase start");
  console.log("2. Copy the service_role key from the output");
  console.log("3. Export: export SUPABASE_SERVICE_ROLE_KEY='...'");
  process.exit(1);
}

const sb = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const userId = "98365ea6-0ebf-496d-83e9-69b38089586d"; // Jornal FM / Transmissão

async function setupWeatherAndGenerate() {
  try {
    console.log("\n📡 Setting up weather for Jornal FM (Transmissão)...\n");

    // Step 1: Check if settings exist
    const { data: settings, error: settingsError } = await sb
      .from("user_settings")
      .select("user_id, weather_city, weather_lat, weather_lon")
      .eq("user_id", userId)
      .maybeSingle();

    if (settingsError) {
      console.error("❌ Error fetching settings:", settingsError.message);
      process.exit(1);
    }

    console.log("Current settings:");
    console.log(JSON.stringify(settings, null, 2));

    // Step 2: If no weather config, set it for Goiânia (or appropriate city)
    if (!settings?.weather_city) {
      console.log("\n⚙️  No weather city configured. Setting to Goiânia (Positiva FM base)...");
      
      const { error: updateError } = await sb
        .from("user_settings")
        .upsert({
          user_id: userId,
          weather_city: "Goiânia",
          weather_lat: -15.7942,  // Goiânia coordinates
          weather_lon: -48.0676,
        })
        .eq("user_id", userId);

      if (updateError) {
        console.error("❌ Error updating settings:", updateError.message);
        process.exit(1);
      }

      console.log("✅ Settings updated!");
    } else {
      console.log(`✅ City already configured: ${settings.weather_city} (${settings.weather_lat}, ${settings.weather_lon})`);
    }

    // Step 3: Invoke the update-weather-xml function
    console.log("\n🌦️  Invoking update-weather-xml function...");

    try {
      // Try to call the deployed Edge Function
      const response = await fetch(`${supabaseUrl}/functions/v1/update-weather-xml`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({}),
      });

      const result = await response.json();
      console.log("✅ Function invoked successfully!");
      console.log("Response:", JSON.stringify(result, null, 2));
    } catch (e) {
      console.error("⚠️  Could not invoke cloud function:", e instanceof Error ? e.message : e);
      console.log("\n💡 Note: If running locally with 'supabase start', the Edge Function");
      console.log("   may not be deployed. The weather XML will be generated on the next");
      console.log("   scheduled cron job run or when deployed to production.\n");
    }

    // Step 4: Verify XML was generated
    console.log("\n✔️  Checking if weather XML was generated...");
    
    try {
      const { data, error } = await sb.storage
        .from("xml-files")
        .download(`xml-tempo-${userId}.xml`);

      if (error) {
        console.error("⏳ Weather XML not found yet (this is expected if running locally)");
        console.error("   Error:", error.message);
        console.log("\n   It will be generated when:");
        console.log("   1. The cron job 'update-weather-xml' runs (every 10 min in prod)");
        console.log("   2. OR when deployed and the Edge Function is triggered");
      } else if (data) {
        const text = await data.text();
        console.log("✅ Weather XML found! Content (first 400 chars):");
        console.log(text.slice(0, 400));
      }
    } catch (e) {
      console.error("⏳ File not found (expected if running locally)");
    }

    console.log("\n✅ Setup complete!\n");
  } catch (e) {
    console.error("Fatal error:", e);
    process.exit(1);
  }
}

setupWeatherAndGenerate();
