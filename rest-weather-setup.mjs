/**
 * Simple HTTP call to update weather settings via direct REST API
 * Uses the Supabase REST endpoint to execute an update query
 */

async function setupWeatherViaRest() {
  const projectId = "qazvgmgdidjhbvcuinpy";
  const supabaseUrl = "https://qazvgmgdidjhbvcuinpy.supabase.co";
  const apiKey = "sb_publishable_BzjxF3H_PSgFYVA3OQIaoA_Pytdg2V3";
  
  const userId = "98365ea6-0ebf-496d-83e9-69b38089586d";
  const weatherCity = "Goiânia";
  const weatherLat = -15.7942;
  const weatherLon = -48.0676;

  console.log("🌦️  Attempting to setup weather via REST API...\n");

  try {
    // Attempt 1: Try via RPC (if available)
    console.log("📡 Option 1: Trying RPC call...");
    const rpcResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/setup_weather_for_user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": apiKey,
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        p_user_id: userId,
        p_weather_city: weatherCity,
        p_weather_lat: weatherLat,
        p_weather_lon: weatherLon,
      }),
    });

    if (rpcResponse.ok) {
      const result = await rpcResponse.json();
      console.log("✅ RPC call succeeded!");
      console.log("Result:", result);
      return;
    } else if (rpcResponse.status !== 404) {
      const text = await rpcResponse.text();
      console.log(`⚠️  RPC returned ${rpcResponse.status}:`, text.slice(0, 100));
    } else {
      console.log("⚠️  RPC function not found (this is OK)\n");
    }

    // Attempt 2: Direct UPDATE via REST (will fail due to RLS, but shows the pattern)
    console.log("📡 Option 2: Trying direct UPDATE via REST...");
    const updateResponse = await fetch(
      `${supabaseUrl}/rest/v1/user_settings?user_id=eq.${userId}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": apiKey,
          "Authorization": `Bearer ${apiKey}`,
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          weather_city: weatherCity,
          weather_lat: weatherLat,
          weather_lon: weatherLon,
        }),
      },
    );

    const updateText = await updateResponse.text();
    console.log(`Update returned ${updateResponse.status}`);
    
    if (!updateResponse.ok) {
      console.log("❌ Direct update failed (expected due to RLS)");
      console.log("   Error:", updateText.slice(0, 200));
    } else {
      console.log("✅ Update succeeded!");
      console.log("   The weather XML will be generated in 10 minutes");
      return;
    }
  } catch (e) {
    console.error("Error:", e.message);
  }

  showSQL();
}

function showSQL() {
  console.log("\n" + "=".repeat(70));
  console.log("📝 RLS policy blocks the REST API update.\n");
  console.log("🔧 WORKAROUND: Use the SQL Editor in the dashboard\n");
  console.log("=".repeat(70) + "\n");
  
  const sql = `INSERT INTO public.user_settings (user_id, weather_city, weather_lat, weather_lon)
VALUES ('98365ea6-0ebf-496d-83e9-69b38089586d', 'Goiânia', -15.7942, -48.0676)
ON CONFLICT (user_id) DO UPDATE SET
  weather_city = 'Goiânia',
  weather_lat = -15.7942,
  weather_lon = -48.0676;`;

  console.log(sql);
  
  console.log("\n" + "=".repeat(70));
  console.log("\n📍 Instructions:");
  console.log("   1. Go to: https://supabase.com/dashboard/project/qazvgmgdidjhbvcuinpy/sql/new");
  console.log("   2. Accept any Google 2FA prompts if needed");
  console.log("   3. Paste the SQL above into the editor");
  console.log("   4. Click 'Run' button");
  console.log("   5. Done! Weather XML will generate in ~10 minutes\n");
}

setupWeatherViaRest();
