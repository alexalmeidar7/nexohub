/**
 * Check if the weather XML file was actually created in storage
 */

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://qazvgmgdidjhbvcuinpy.supabase.co";
const apiKey = "sb_publishable_BzjxF3H_PSgFYVA3OQIaoA_Pytdg2V3";

const sb = createClient(supabaseUrl, apiKey);

const userId = "98365ea6-0ebf-496d-83e9-69b38089586d";

async function checkWeatherFile() {
  console.log("🔍 Checking for weather XML file in storage...\n");

  try {
    // List files in xml-files bucket
    const { data: files, error: listError } = await sb.storage
      .from("xml-files")
      .list("", { limit: 100 });

    if (listError) {
      console.error("❌ Error listing files:", listError.message);
      return;
    }

    console.log("📁 Files in xml-files bucket:");
    const weatherFiles = files
      .filter((f) => f.name.includes("tempo") || f.name.includes("weather"))
      .slice(0, 20);

    if (weatherFiles.length === 0) {
      console.log("   (No tempo/weather files found)\n");
    } else {
      weatherFiles.forEach((f) => {
        console.log(`   ✓ ${f.name}`);
      });
      console.log("");
    }

    // Try to download the specific weather file
    const fileName = `xml-tempo-${userId}.xml`;
    console.log(`📥 Attempting to download: ${fileName}\n`);

    const { data: fileData, error: downloadError } = await sb.storage
      .from("xml-files")
      .download(fileName);

    if (downloadError) {
      console.error(`❌ File not found: ${downloadError.message}\n`);
      console.log("   Possible reasons:");
      console.log("   1. User settings for weather (city/lat/lon) not yet saved");
      console.log("   2. The update-weather-xml function didn't process this user");
      console.log("   3. Permission/RLS issues preventing file generation\n");
      return;
    }

    if (fileData) {
      const text = await fileData.text();
      console.log("✅ FILE FOUND! Weather XML content:\n");
      console.log(text.slice(0, 800));
      console.log("\n... (truncated)\n");
    }
  } catch (e) {
    console.error("Error:", e.message);
  }
}

checkWeatherFile();
