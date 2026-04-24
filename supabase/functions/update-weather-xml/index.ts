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

function getLabel(code: number): string {
  const codes = Object.keys(weatherLabelsMap).map(Number);
  const closest = codes.reduce((prev, curr) =>
    Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev
  );
  return weatherLabelsMap[closest] || "Desconhecido";
}

/* ── Flat white-line SVG weather icons (matching CenarioTela WeatherIcons) ── */
function weatherIconSvg(code: number, isNight = false): string {
  const S = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">`;
  const E = `</svg>`;

  // Sun
  const sun = `<circle cx="32" cy="26" r="8"/>${[0,45,90,135,180,225,270,315].map(a=>{const r=a*Math.PI/180;return`<line x1="${(32+13*Math.cos(r)).toFixed(1)}" y1="${(26+13*Math.sin(r)).toFixed(1)}" x2="${(32+18*Math.cos(r)).toFixed(1)}" y2="${(26+18*Math.sin(r)).toFixed(1)}"/>`}).join("")}`;
  // Moon
  const moon = `<path d="M36 16a12 12 0 1 0 0 20 10 10 0 0 1 0-20z"/>`;
  // Cloud
  const cloud = `<path d="M20 44a8 8 0 0 1 0-16h1a12 12 0 0 1 22 4h1a7 7 0 0 1 0 14H20z"/>`;
  // Small cloud (for partly cloudy)
  const smallCloud = `<path d="M24 50a6 6 0 0 1 0-12h1a9 9 0 0 1 16 3h1a5 5 0 0 1 0 10H24z"/>`;
  // Rain drops
  const rain = (n: number) => Array.from({length: n}, (_, i) => {
    const x = 26 + i * 6;
    return `<line x1="${x}" y1="50" x2="${x-2}" y2="58"/>`;
  }).join("");
  // Heavy rain
  const heavyRain = Array.from({length: 4}, (_, i) => {
    const x = 22 + i * 7;
    return `<line x1="${x}" y1="48" x2="${x-3}" y2="60"/>`;
  }).join("");
  // Snow dots
  const snow = (n: number) => Array.from({length: n}, (_, i) => {
    const x = 26 + i * 7;
    const y = i % 2 === 0 ? 52 : 56;
    return `<circle cx="${x}" cy="${y}" r="1.5" fill="white"/>`;
  }).join("");
  // Lightning bolt
  const bolt = `<polyline points="34,42 30,50 36,50 32,60" stroke-width="2.5"/>`;
  // Fog lines
  const fog = `<line x1="16" y1="48" x2="48" y2="48"/><line x1="20" y1="54" x2="44" y2="54"/><line x1="18" y1="60" x2="46" y2="60"/>`;

  // Map WMO code to icon
  const codes = Object.keys(weatherLabelsMap).map(Number);
  const c = codes.reduce((prev, curr) => Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev);

  let body = "";
  if (c === 0) {
    body = isNight ? moon : sun;
  } else if (c <= 2) {
    body = (isNight ? `<g transform="translate(-4,-10) scale(0.7)">${moon}</g>` : `<g transform="translate(-4,-10) scale(0.7)">${sun}</g>`) + smallCloud;
  } else if (c === 3) {
    body = cloud;
  } else if (c <= 48) {
    body = cloud + fog;
  } else if (c <= 55) {
    body = cloud + rain(2);
  } else if (c <= 63) {
    body = cloud + rain(3);
  } else if (c <= 65) {
    body = cloud + heavyRain;
  } else if (c <= 75) {
    body = cloud + snow(3);
  } else if (c <= 82) {
    body = cloud + heavyRain;
  } else {
    body = cloud + bolt;
  }

  return `${S}${body}${E}`;
}

function weatherIconKey(code: number, isNight = false): string {
  const suffix = isNight ? "n" : "d";
  const codes = Object.keys(weatherLabelsMap).map(Number);
  const c = codes.reduce((prev, curr) => Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev);
  return `weather-icon-${c}-${suffix}`;
}

// Cache of uploaded icon public URLs (within single invocation)
const uploadedIcons: Record<string, string> = {};

async function ensureIconUploaded(
  supabase: ReturnType<typeof createClient>,
  code: number,
  isNight: boolean,
): Promise<string> {
  const key = weatherIconKey(code, isNight);
  if (uploadedIcons[key]) return uploadedIcons[key];

  const fileName = `weather-icons/${key}.svg`;
  const svg = weatherIconSvg(code, isNight);
  const blob = new Blob([svg], { type: "image/svg+xml" });

  await supabase.storage
    .from("xml-files")
    .upload(fileName, blob, { upsert: true, contentType: "image/svg+xml" });

  const { data: urlData } = supabase.storage.from("xml-files").getPublicUrl(fileName);
  const publicUrl = urlData?.publicUrl || "";
  uploadedIcons[key] = publicUrl;
  return publicUrl;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

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

        const wxRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,apparent_temperature,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunrise,sunset&timezone=auto&forecast_days=2`
        );
        const d = await wxRes.json();

        const nowLocal = new Date().toLocaleString("sv-SE", { timeZone: d.timezone || "UTC" });
        const nowTime = nowLocal.split(" ")[1]?.substring(0, 5) || "12:00";
        const sunrise = d.daily.sunrise?.[0]?.split("T")[1]?.substring(0, 5) || "06:00";
        const sunset = d.daily.sunset?.[0]?.split("T")[1]?.substring(0, 5) || "18:00";
        const isNight = nowTime < sunrise || nowTime > sunset;

        // Upload flat SVG icon and get public URL
        const iconUrl = await ensureIconUploaded(supabase as any, d.current.weather_code, isNight);
        const condLabel = getLabel(d.current.weather_code);

        let amanhaXml = "";
        if (d.daily.temperature_2m_min[1] != null) {
          const twCode = d.daily.weather_code[1] ?? 0;
          const twIconUrl = await ensureIconUploaded(supabase as any, twCode, false);
          const twLabel = getLabel(twCode);
          amanhaXml = `
    <amanha>
      <temperatura_minima>${Math.round(d.daily.temperature_2m_min[1])}Cº</temperatura_minima>
      <temperatura_maxima>${Math.round(d.daily.temperature_2m_max[1])}Cº</temperatura_maxima>
      <url_imagem_icone>${twIconUrl}</url_imagem_icone>
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
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
