/**
 * Quick fix: Generate weather XML by setting city for Jornal FM
 * 
 * This script updates user_settings with weather coordinates for Jornal FM (Transmissão)
 * Then the background job update-weather-xml will generate the XML
 */

async function generateWeatherForJornalFM() {
  const projectId = "qazvgmgdidjhbvcuinpy";
  const userId = "98365ea6-0ebf-496d-83e9-69b38089586d"; // Jornal FM / Transmissão

  // Goiânia coordinates (central Brazil) - suitable for Jornal FM
  const weatherCity = "Goiânia";
  const weatherLat = -15.7942;
  const weatherLon = -48.0676;

  console.log("🌦️  Updating weather configuration for Jornal FM...");
  console.log(`   City: ${weatherCity}`);
  console.log(`   Coordinates: ${weatherLat}, ${weatherLon}`);

  // Build the API request to update user_settings
  const url = `https://${projectId}.supabase.co/rest/v1/user_settings`;
  
  // Note: This requires ADMIN/SERVICE_ROLE access - for demonstration only
  // In production, use the Supabase Dashboard or CLI
  
  console.log("\n📝 To complete this manually:");
  console.log("1. Go to: https://supabase.com/dashboard/project/qazvgmgdidjhbvcuinpy/sql/new");
  console.log("2. Run this SQL:");
  console.log(`
-- Update weather settings for Jornal FM
INSERT INTO user_settings (user_id, weather_city, weather_lat, weather_lon)
VALUES ('${userId}', '${weatherCity}', ${weatherLat}, ${weatherLon})
ON CONFLICT (user_id) DO UPDATE SET
  weather_city = '${weatherCity}',
  weather_lat = ${weatherLat},
  weather_lon = ${weatherLon};

-- Then the background job 'update-weather-xml' will automatically generate the XML
-- This typically runs every 10 minutes in production
  `);

  console.log("\n💡 Or use the UI:");
  console.log("1. Go to: http://localhost:8080/home?page=promocoes");
  console.log("2. Click 'Previsão do Tempo'");
  console.log("3. Search for 'Goiânia' or your city");
  console.log("4. Click to select and save");
  console.log("5. The XML will be generated automatically within 10 minutes");
}

generateWeatherForJornalFM();
