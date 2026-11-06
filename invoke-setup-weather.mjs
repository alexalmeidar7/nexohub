/**
 * Invoke the setup-weather-config Edge Function
 */

const supabaseUrl = "https://qazvgmgdidjhbvcuinpy.supabase.co";
const anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhenZnbWdkaWRqaGJ2Y3VpbnB5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzA4MjY0MDAsImV4cCI6MjA0NjM5NDQwMH0.U4PaCJYLLcvBlRl5q8mQDVGHLRg3ZpGfL42JAjV2o";

async function invokeSetupWeather() {
  console.log("🚀 Invoking setup-weather-config function...\n");

  try {
    const response = await fetch(
      `${supabaseUrl}/functions/v1/setup-weather-config`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${anonKey}`,
        },
      }
    );

    console.log(`Response status: ${response.status} ${response.statusText}\n`);
    
    const data = await response.json();
    console.log("Response:", JSON.stringify(data, null, 2));

    if (response.ok && data.status === "success") {
      console.log("\n✅ Weather setup completed successfully!");
      console.log("   Weather settings were created/updated");
      console.log("   update-weather-xml function was invoked");
    }
  } catch (e) {
    console.error("Error:", e.message);
  }
}

invokeSetupWeather();
