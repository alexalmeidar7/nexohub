/**
 * Invoke the update-weather-xml Edge Function to generate weather files immediately
 */

async function invokeWeatherUpdate() {
  const supabaseUrl = "https://qazvgmgdidjhbvcuinpy.supabase.co";
  const apiKey = "sb_publishable_BzjxF3H_PSgFYVA3OQIaoA_Pytdg2V3";

  console.log("🌦️  Invoking update-weather-xml function...\n");

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/update-weather-xml`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({}),
      },
    );

    console.log(`📡 Response: ${response.status} ${response.statusText}\n`);

    const text = await response.text();
    
    if (text) {
      try {
        const json = JSON.parse(text);
        console.log("📋 Response:", JSON.stringify(json, null, 2));
      } catch {
        console.log("📋 Response:", text.slice(0, 500));
      }
    }

    if (response.ok) {
      console.log("\n✅ Function invoked successfully!");
      console.log("   The weather XML should be generated now.");
    } else {
      console.log("\n⚠️  Function returned an error (this may be OK)");
      console.log("   The background job may not be deployed locally.");
      console.log("   In production, the cron job runs every 10 minutes.");
    }
  } catch (e) {
    console.error("❌ Error invoking function:", e.message);
    console.log("\n💡 This is expected if running in local development mode.");
    console.log("   The update-weather-xml job will run on schedule in production.");
  }
}

invokeWeatherUpdate();
