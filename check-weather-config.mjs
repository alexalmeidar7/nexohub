import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// User ID for Jornal FM / Transmissão
const userId = "98365ea6-0ebf-496d-83e9-69b38089586d";

try {
  // Check user_settings for weather config
  const { data: settings, error: settingsError } = await sb
    .from("user_settings")
    .select("user_id, weather_city, weather_lat, weather_lon")
    .eq("user_id", userId);

  if (settingsError) {
    console.error("Error fetching user_settings:", settingsError.message);
    process.exit(1);
  }

  console.log("User Settings for weather:");
  console.log(JSON.stringify(settings, null, 2));

  // Check if xml-tempo file exists
  try {
    const { data, error } = await sb.storage
      .from("xml-files")
      .download(`xml-tempo-${userId}.xml`);
    
    if (error) {
      console.error("\n❌ Error downloading weather XML:", error.message);
    } else if (data) {
      const text = await data.text();
      console.log("\n✅ Weather XML exists! Content (first 300 chars):");
      console.log(text.slice(0, 300));
    }
  } catch (e) {
    console.error("Failed to check weather XML:", e instanceof Error ? e.message : e);
  }

  console.log("\n✅ Check complete");
} catch (e) {
  console.error("Fatal error:", e);
  process.exit(1);
}
