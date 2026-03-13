import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const weatherLabelsMap: Record<number, string> = {
  0: "Céu limpo", 1: "Parcialmente limpo", 2: "Parcialmente nublado", 3: "Nublado",
  45: "Neblina", 48: "Neblina", 51: "Garoa leve", 53: "Garoa", 55: "Garoa forte",
  61: "Chuva leve", 63: "Chuva moderada", 65: "Chuva forte",
  71: "Neve leve", 73: "Neve", 75: "Neve forte",
  80: "Pancadas leves", 81: "Pancadas", 82: "Pancadas fortes",
  95: "Tempestade", 96: "Tempestade com granizo", 99: "Tempestade severa",
};

function weatherCodeToWbIcon(code: number): string {
  const map: Record<number, string> = {
    0: "c01d", 1: "c02d", 2: "c02d", 3: "c04d",
    45: "a05d", 48: "a05d", 51: "d01d", 53: "d02d", 55: "d03d",
    61: "r01d", 63: "r02d", 65: "r03d", 71: "s01d", 73: "s02d", 75: "s03d",
    80: "r04d", 81: "r05d", 82: "r06d", 95: "t01d", 96: "t04d", 99: "t05d",
  };
  const codes = Object.keys(map).map(Number);
  const closest = codes.reduce((prev, curr) =>
    Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev
  );
  return map[closest] || "c01d";
}

function getLabel(code: number): string {
  const codes = Object.keys(weatherLabelsMap).map(Number);
  const closest = codes.reduce((prev, curr) =>
    Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev
  );
  return weatherLabelsMap[closest] || "Desconhecido";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Fetch all users with weather city configured
    const { data: settings, error: settingsErr } = await supabase
      .from("user_settings")
      .select("user_id, weather_city, weather_lat, weather_lon")
      .not("weather_city", "is", null);

    if (settingsErr || !settings?.length) {
      return new Response(
        JSON.stringify({ message: "No users with weather configured", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let updated = 0;

    for (const s of settings) {
      try {
        let lat = s.weather_lat;
        let lon = s.weather_lon;
        let name = s.weather_city;

        // If no coords, geocode
        if (!lat || !lon) {
          const geoRes = await fetch(
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=pt`
          );
          const geo = await geoRes.json();
          if (!geo.results?.length) continue;
          lat = geo.results[0].latitude;
          lon = geo.results[0].longitude;
          name = geo.results[0].name;
        }

        // Fetch weather
        const wxRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code&timezone=auto&forecast_days=2`
        );
        const d = await wxRes.json();

        const wbIcon = weatherCodeToWbIcon(d.current.weather_code);
        const iconUrl = `https://www.weatherbit.io/static/img/icons/${wbIcon}.png`;
        const condLabel = getLabel(d.current.weather_code);

        let amanhaXml = "";
        if (d.daily.temperature_2m_min[1] != null) {
          const twCode = d.daily.weather_code[1] ?? 0;
          const twIcon = `https://www.weatherbit.io/static/img/icons/${weatherCodeToWbIcon(twCode)}.png`;
          const twLabel = getLabel(twCode);
          amanhaXml = `
    <amanha>
      <temperatura_minima>${Math.round(d.daily.temperature_2m_min[1])}Cº</temperatura_minima>
      <temperatura_maxima>${Math.round(d.daily.temperature_2m_max[1])}Cº</temperatura_maxima>
      <url_imagem_icone>${twIcon}</url_imagem_icone>
      <descricao_tempo>${twLabel}</descricao_tempo>
    </amanha>`;
        }

        const weatherXml = `<?xml version="1.0" encoding="UTF-8"?>
<tempo>
    <cidade>${name}</cidade>
    <temperatura>${Math.round(d.current.temperature_2m)}Cº</temperatura>
    <descricao>${condLabel}</descricao>
    <icone_url>${iconUrl}</icone_url>
    <minima>${Math.round(d.daily.temperature_2m_min[0])}Cº</minima>
    <maxima>${Math.round(d.daily.temperature_2m_max[0])}Cº</maxima>
    <humidade>${d.current.relative_humidity_2m}%</humidade>
    <precipitacao>${d.daily.precipitation_probability_max[0] ?? 0}%</precipitacao>${amanhaXml}
</tempo>`;

        // Upload to storage
        const fileName = `weather-${s.user_id}.xml`;
        const file = new Blob([weatherXml], { type: "application/xml" });
        await supabase.storage
          .from("xml-files")
          .upload(fileName, file, { upsert: true, contentType: "application/xml" });

        updated++;
      } catch (err) {
        console.error(`Weather update failed for user ${s.user_id}:`, err);
      }
    }

    return new Response(
      JSON.stringify({ message: "Weather XML updated", count: updated }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("update-weather-xml error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
