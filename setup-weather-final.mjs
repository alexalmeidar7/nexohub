/**
 * Create weather settings for the user or update if exists
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://qazvgmgdidjhbvcuinpy.supabase.co";
const apiKey = "sb_publishable_BzjxF3H_PSgFYVA3OQIaoA_Pytdg2V3";

const sb = createClient(supabaseUrl, apiKey);

const userId = "98365ea6-0ebf-496d-83e9-69b38089586d";

async function setupWeatherSettings() {
  console.log("🌍 Setting up weather configuration...\n");

  try {
    // First, check if record exists
    console.log("1️⃣  Checking if user_settings exists...");
    const { data: existing } = await sb
      .from("user_settings")
      .select("*")
      .eq("user_id", userId);

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
        console.error("❌ Error updating:", error.message);
        return;
      }

      console.log("   ✅ Updated successfully\n");
      console.log("   Updated row:", data[0]);
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
        console.error("❌ Error creating:", error.message);
        return;
      }

      console.log("   ✅ Created successfully\n");
      console.log("   New row:", data[0]);
    }

    console.log("\n2️⃣  Invoking update-weather-xml function...\n");

    const response = await fetch(
      "https://qazvgmgdidjhbvcuinpy.supabase.co/functions/v1/update-weather-xml",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
      }
    );

    const result = await response.json();
    console.log(`   Response: ${response.status} ${response.statusText}`);
    console.log("   ", result);
    console.log("\n3️⃣  Verifying weather XML was generated...\n");

    // Check if file was created
    const fileName = `xml-tempo-${userId}.xml`;
    const { data: fileData, error: downloadError } = await sb.storage
      .from("xml-files")
      .download(fileName);

    if (downloadError) {
      console.log(`   ⚠️  File not found: ${fileName}`);
      console.log("   The function may still be processing. Try again in 30 seconds.");
    } else {
      console.log(`   ✅ File created: ${fileName}`);
      const text = await fileData.text();
      console.log("   Preview (first 300 chars):");
      console.log("   " + text.slice(0, 300).replace(/\n/g, "\n   "));
    }
  } catch (e) {
    console.error("Error:", e.message);
  }
}

setupWeatherSettings();
