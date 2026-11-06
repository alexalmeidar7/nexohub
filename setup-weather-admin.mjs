/**
 * Setup weather using service role (admin) access
 */

const supabaseUrl = "https://qazvgmgdidjhbvcuinpy.supabase.co";
// This is the service role key - has full admin access
const serviceKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFhenZnbWdkaWRqaGJ2Y3VpbnB5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMDgyNjQwMCwiZXhwIjoyMDQ2Mzk0NDAwfQ.3bHjHZuv7YZhSN7Evc4Qfr3_9YV4IWqZFNuQZqvqRzk";

const userId = "98365ea6-0ebf-496d-83e9-69b38089586d";

async function setupWeatherAdmin() {
  console.log("🌍 Setting up weather via admin access...\n");

  try {
    // Import at runtime to avoid dependency issues
    const { createClient } = await import("@supabase/supabase-js");

    const sb = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    console.log("1️⃣  Checking if user_settings exists...");
    const { data: existing, error: checkError } = await sb
      .from("user_settings")
      .select("*")
      .eq("user_id", userId);

    if (checkError) {
      console.error("   ❌ Check error:", checkError.message);
      return;
    }

    if (existing && existing.length > 0) {
      console.log("   ✓ Record exists. Updating...\n");

      const { data, error } = await sb
        .from("user_settings")
        .update({
          weather_city: "São Paulo",
          weather_lat: -23.5505,
          weather_lon: -46.6333,
        })
        .eq("user_id", userId)
        .select();

      if (error) {
        console.error("   ❌ Error updating:", error.message);
        return;
      }

      console.log("   ✅ Updated successfully\n");
      if (data && data[0]) {
        console.log("   Updated data:");
        console.log(`     - weather_city: ${data[0].weather_city}`);
        console.log(`     - weather_lat: ${data[0].weather_lat}`);
        console.log(`     - weather_lon: ${data[0].weather_lon}\n`);
      }
    } else {
      console.log("   ✗ Record doesn't exist. Creating...\n");

      const { data, error } = await sb
        .from("user_settings")
        .insert({
          user_id: userId,
          weather_city: "São Paulo",
          weather_lat: -23.5505,
          weather_lon: -46.6333,
        })
        .select();

      if (error) {
        console.error("   ❌ Error creating:", error.message);
        return;
      }

      console.log("   ✅ Created successfully\n");
      if (data && data[0]) {
        console.log("   New data:");
        console.log(`     - user_id: ${data[0].user_id}`);
        console.log(`     - weather_city: ${data[0].weather_city}`);
        console.log(`     - weather_lat: ${data[0].weather_lat}`);
        console.log(`     - weather_lon: ${data[0].weather_lon}\n`);
      }
    }

    console.log("2️⃣  Invoking update-weather-xml function...\n");

    const response = await fetch(
      `${supabaseUrl}/functions/v1/update-weather-xml`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceKey}`,
        },
      }
    );

    const result = await response.json();
    console.log(`   Response: ${response.status} ${response.statusText}`);
    console.log("   Result:", result, "\n");

    // Wait a bit for the file to be written
    console.log("   ⏳ Waiting 2 seconds for file to be written...\n");
    await new Promise((r) => setTimeout(r, 2000));

    console.log("3️⃣  Verifying weather XML was generated...\n");

    const fileName = `xml-tempo-${userId}.xml`;
    const { data: fileData, error: downloadError } = await sb.storage
      .from("xml-files")
      .download(fileName);

    if (downloadError) {
      console.log(`   ⚠️  File not found yet: ${fileName}`);
      console.log("   The function may still be processing. Retry in 30 seconds.");
    } else {
      console.log(`   ✅ File created: ${fileName}`);
      const text = await fileData.text();
      console.log("   Preview (first 400 chars):\n");
      console.log("   " + text.slice(0, 400).replace(/\n/g, "\n   ") + "\n");
    }
  } catch (e) {
    console.error("Error:", e.message);
  }
}

setupWeatherAdmin();
