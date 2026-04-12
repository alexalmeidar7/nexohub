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

function weatherCodeToWbIcon(code: number, isNight = false): string {
  const suffix = isNight ? "n" : "d";
  const map: Record<number, string> = {
    0: `c01${suffix}`, 1: `c02${suffix}`, 2: `c02${suffix}`, 3: `c04${suffix}`,
    45: `a05${suffix}`, 48: `a05${suffix}`, 51: `d01${suffix}`, 53: `d02${suffix}`, 55: `d03${suffix}`,
    61: `r01${suffix}`, 63: `r02${suffix}`, 65: `r03${suffix}`, 71: `s01${suffix}`, 73: `s02${suffix}`, 75: `s03${suffix}`,
    80: `r04${suffix}`, 81: `r05${suffix}`, 82: `r06${suffix}`, 95: `t01${suffix}`, 96: `t04${suffix}`, 99: `t05${suffix}`,
  };
  const codes = Object.keys(map).map(Number);
  const closest = codes.reduce((prev, curr) =>
    Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev
  );
  return map[closest] || `c01${suffix}`;
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
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,apparent_temperature,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunrise,sunset&timezone=auto&forecast_days=2`
        );
        const d = await wxRes.json();

        // Determine if it's currently nighttime
        const nowLocal = new Date().toLocaleString("sv-SE", { timeZone: d.timezone || "UTC" });
        const nowTime = nowLocal.split(" ")[1]?.substring(0, 5) || "12:00";
        const sunrise = d.daily.sunrise?.[0]?.split("T")[1]?.substring(0, 5) || "06:00";
        const sunset = d.daily.sunset?.[0]?.split("T")[1]?.substring(0, 5) || "18:00";
        const isNight = nowTime < sunrise || nowTime > sunset;

        const wbIcon = weatherCodeToWbIcon(d.current.weather_code, isNight);
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
    <sensacao_termica>${Math.round(d.current.apparent_temperature)}Cº</sensacao_termica>
    <vento>${Math.round(d.current.wind_speed_10m)} km/h</vento>
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
