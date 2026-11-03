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

  const sun = `<circle cx="32" cy="26" r="8"/>${[0,45,90,135,180,225,270,315].map(a=>{const r=a*Math.PI/180;return`<line x1="${(32+13*Math.cos(r)).toFixed(1)}" y1="${(26+13*Math.sin(r)).toFixed(1)}" x2="${(32+18*Math.cos(r)).toFixed(1)}" y2="${(26+18*Math.sin(r)).toFixed(1)}"/>`}).join("")}`;
  const moon = `<path d="M36 16a12 12 0 1 0 0 20 10 10 0 0 1 0-20z"/>`;
  const cloud = `<path d="M20 44a8 8 0 0 1 0-16h1a12 12 0 0 1 22 4h1a7 7 0 0 1 0 14H20z"/>`;
  const smallCloud = `<path d="M24 50a6 6 0 0 1 0-12h1a9 9 0 0 1 16 3h1a5 5 0 0 1 0 10H24z"/>`;
  const rain = (n: number) => Array.from({length: n}, (_, i) => {
    const x = 26 + i * 6;
    return `<line x1="${x}" y1="50" x2="${x-2}" y2="58"/>`;
  }).join("");
  const heavyRain = Array.from({length: 4}, (_, i) => {
    const x = 22 + i * 7;
    return `<line x1="${x}" y1="48" x2="${x-3}" y2="60"/>`;
  }).join("");
  const snow = (n: number) => Array.from({length: n}, (_, i) => {
    const x = 26 + i * 7;
    const y = i % 2 === 0 ? 52 : 56;
    return `<circle cx="${x}" cy="${y}" r="1.5" fill="white"/>`;
  }).join("");
  const bolt = `<polyline points="34,42 30,50 36,50 32,60" stroke-width="2.5"/>`;
  const fog = `<line x1="16" y1="48" x2="48" y2="48"/><line x1="20" y1="54" x2="44" y2="54"/><line x1="18" y1="60" x2="46" y2="60"/>`;

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

// Map WMO code → basmilius/weather-icons name (colored set)
function basmiliusIconName(code: number, isNight: boolean): string {
  const codes = Object.keys(weatherLabelsMap).map(Number);
  const c = codes.reduce((prev, curr) => Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev);
  if (c === 0) return isNight ? "clear-night" : "clear-day";
  if (c <= 2) return isNight ? "partly-cloudy-night" : "partly-cloudy-day";
  if (c === 3) return "cloudy";
  if (c <= 48) return "fog";
  if (c <= 55) return "drizzle";
  if (c <= 65) return "rain";
  if (c <= 75) return "snow";
  if (c <= 82) return "rain";
  return "thunderstorms-rain";
}

function weatherIconKey(code: number, isNight = false): string {
  const suffix = isNight ? "n" : "d";
  const codes = Object.keys(weatherLabelsMap).map(Number);
  const c = codes.reduce((prev, curr) => Math.abs(curr - code) < Math.abs(prev - code) ? curr : prev);
  return `weather-icon-static-${c}-${suffix}`;
}

const uploadedIcons: Record<string, string> = {};
let weatherIconFiles: Set<string> | null = null;
let weatherIconFilesPromise: Promise<Set<string>> | null = null;

async function getWeatherIconFiles(supabase: ReturnType<typeof createClient>): Promise<Set<string>> {
  if (weatherIconFiles) return weatherIconFiles;
  if (!weatherIconFilesPromise) {
    weatherIconFilesPromise = (async () => {
      const { data, error } = await supabase.storage.from("xml-files").list("weather-icons", { limit: 1000 });
      if (error) {
        console.warn("Não foi possível listar os ícones já armazenados:", error.message);
        return new Set<string>();
      }
      return new Set((data || []).map((file) => file.name));
    })();
  }
  weatherIconFiles = await weatherIconFilesPromise;
  return weatherIconFiles;
}

const xmlEscape = (value: unknown) => String(value ?? "")
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&apos;");

async function ensureIconUploaded(
  supabase: ReturnType<typeof createClient>,
  code: number,
  isNight: boolean,
): Promise<string> {
  const key = weatherIconKey(code, isNight);
  if (uploadedIcons[key]) return uploadedIcons[key];

  const pngFileName = `weather-icons/${key}.png`;
  const { data: pngUrlData } = supabase.storage.from("xml-files").getPublicUrl(pngFileName);
  const publicUrl = (pngUrlData?.publicUrl || "").split("?")[0];
  const existingFiles = await getWeatherIconFiles(supabase);

  // Os ícones são imutáveis por código/clima: reutilize o PNG do Storage.
  // Antes, cada execução do cron buscava e reenviava os mesmos arquivos.
  if (existingFiles.has(`${key}.png`)) {
    uploadedIcons[key] = publicUrl;
    return publicUrl;
  }

  const iconName = basmiliusIconName(code, isNight);
  const svgSource = `https://cdn.jsdelivr.net/gh/basmilius/weather-icons@dev/production/fill/svg-static/${iconName}.svg`;
  const pngFetchUrl = `https://wsrv.nl/?url=${encodeURIComponent(svgSource)}&output=png&w=256&h=256`;

  try {
    const res = await fetch(pngFetchUrl, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Conversor de ícones respondeu HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    const { error } = await supabase.storage
      .from("xml-files")
      .upload(pngFileName, bytes, { upsert: true, contentType: "image/png", cacheControl: "31536000" });
    if (error) throw error;
    existingFiles.add(`${key}.png`);
    uploadedIcons[key] = publicUrl;
    return publicUrl;
  } catch (err) {
    console.error("Colored icon fetch/upload failed:", err);
    uploadedIcons[key] = "";
    return "";
  }
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
        { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } }
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
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=pt`,
            { signal: AbortSignal.timeout(6000) },
          );
          if (!geoRes.ok) throw new Error(`Geocoding respondeu HTTP ${geoRes.status}`);
          const geo = await geoRes.json();
          if (!geo.results?.length) continue;
          lat = geo.results[0].latitude;
          lon = geo.results[0].longitude;
          name = geo.results[0].name;
          // Salva as coordenadas encontradas para não geocodificar a mesma cidade
          // em todas as execuções futuras do cron.
          const { error: coordsError } = await supabase.from("user_settings")
            .update({ weather_lat: lat, weather_lon: lon })
            .eq("user_id", s.user_id);
          if (coordsError) console.warn(`Não foi possível persistir coordenadas do tempo para ${s.user_id}:`, coordsError.message);
        }

        const wxRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,apparent_temperature,wind_speed_10m,is_day&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,sunrise,sunset,relative_humidity_2m_max&timezone=auto&forecast_days=6`,
          { signal: AbortSignal.timeout(8000) },
        );
        if (!wxRes.ok) throw new Error(`Open-Meteo respondeu HTTP ${wxRes.status}`);
        const d = await wxRes.json();

        if (!d?.current || !d?.daily?.time?.length) {
          console.error(
            `Weather API returned no data for user ${s.user_id}:`,
            typeof d?.reason === "string" ? d.reason : JSON.stringify(d)?.slice(0, 300),
          );
          continue;
        }

        // Reliable day/night via Open-Meteo's is_day flag (1 = day, 0 = night)
        const isNight = d.current?.is_day === 0;

        const dailyCodes = (d.daily.weather_code || []).map((code: number) => Number(code ?? 0));
        const uniqueIconSpecs = new Map<string, { code: number; isNight: boolean }>();
        uniqueIconSpecs.set(weatherIconKey(d.current.weather_code, isNight), { code: d.current.weather_code, isNight });
        dailyCodes.forEach((code: number, index: number) => {
          if (index > 0) uniqueIconSpecs.set(weatherIconKey(code, false), { code, isNight: false });
        });
        const iconPairs = await Promise.all(
          [...uniqueIconSpecs.entries()].map(async ([key, spec]) => [key, await ensureIconUploaded(supabase as any, spec.code, spec.isNight)] as const),
        );
        const iconUrls = new Map(iconPairs);
        const iconUrl = iconUrls.get(weatherIconKey(d.current.weather_code, isNight)) || "";
        const dailyIconUrls = dailyCodes.map((code: number, index: number) =>
          index === 0 ? iconUrl : (iconUrls.get(weatherIconKey(code, false)) || ""),
        );
        const condLabel = getLabel(d.current.weather_code);

        // ─── Build weather-{user_id}.xml (legacy <tempo> format) ───
        let amanhaXml = "";
        if (d.daily.temperature_2m_min[1] != null) {
          const twCode = d.daily.weather_code[1] ?? 0;
          const twIconUrl = dailyIconUrls[1] || "";
          const twLabel = getLabel(twCode);
          amanhaXml = `
    <amanha>
      <temperatura_minima>${Math.round(d.daily.temperature_2m_min[1])}ºC</temperatura_minima>
      <temperatura_maxima>${Math.round(d.daily.temperature_2m_max[1])}ºC</temperatura_maxima>
      <url_imagem_icone>${twIconUrl}</url_imagem_icone>
      <descricao_tempo>${xmlEscape(twLabel)}</descricao_tempo>
    </amanha>`;
        }

        const weatherXml = `<?xml version="1.0" encoding="UTF-8"?>
<tempo>
    <cidade>${xmlEscape(name)}</cidade>
    <temperatura>${Math.round(d.current.temperature_2m)}ºC</temperatura>
    <descricao>${xmlEscape(condLabel)}</descricao>
    <icone_url>${iconUrl}</icone_url>
    <minima>${Math.round(d.daily.temperature_2m_min[0])}ºC</minima>
    <maxima>${Math.round(d.daily.temperature_2m_max[0])}ºC</maxima>
    <humidade>${d.current.relative_humidity_2m}%</humidade>
    <sensacao_termica>${Math.round(d.current.apparent_temperature)}ºC</sensacao_termica>
    <vento>${Math.round(d.current.wind_speed_10m)} km/h</vento>
    <precipitacao>${d.daily.precipitation_probability_max[0] ?? 0}%</precipitacao>${amanhaXml}
</tempo>`;

        const fileName = `weather-${s.user_id}.xml`;
        const file = new Blob([weatherXml], { type: "application/xml" });
        const { error: legacyXmlError } = await supabase.storage
          .from("xml-files")
          .upload(fileName, file, { upsert: true, contentType: "application/xml", cacheControl: "30" });
        if (legacyXmlError) throw legacyXmlError;

        // ─── Build xml-tempo-{user_id}.xml (<previsao> format used by client) ───
        const dailyLen = d.daily?.time?.length || 0;
        const dayBlocks: string[] = [];
        for (let i = 0; i < dailyLen; i++) {
          const code = d.daily.weather_code[i] ?? 0;
          const iconU = dailyIconUrls[i] || "";
          const lbl = getLabel(code);
          const tempAvg = Math.round(((d.daily.temperature_2m_max[i] ?? 0) + (d.daily.temperature_2m_min[i] ?? 0)) / 2);
          const tag = i === 0 ? "atual" : "dia";
          const dateAttr = i === 0 ? "Agora" : d.daily.time[i];
          // For "atual" use current temp + day/night icon
          const temp = i === 0 ? Math.round(d.current.temperature_2m) : tempAvg;
          const icon = i === 0 ? iconUrl : iconU;
          const desc = i === 0 ? condLabel : lbl;
          const humid = i === 0 ? d.current.relative_humidity_2m : (d.daily.relative_humidity_2m_max?.[i] ?? 0);
          dayBlocks.push(
            `  <${tag} date="${dateAttr}">\n` +
            `    <cidade>${xmlEscape(name)}</cidade>\n` +
            `    <temperatura>${temp}ºC</temperatura>\n` +
            `    <descricao>${xmlEscape(desc)}</descricao>\n` +
            `    <icone_url>${icon}</icone_url>\n` +
            `    <minima>${Math.round(d.daily.temperature_2m_min[i] ?? 0)}ºC</minima>\n` +
            `    <maxima>${Math.round(d.daily.temperature_2m_max[i] ?? 0)}ºC</maxima>\n` +
            `    <humidade>${humid}%</humidade>\n` +
            `    <precipitacao>${d.daily.precipitation_probability_max[i] ?? 0}%</precipitacao>\n` +
            `  </${tag}>`
          );
        }

        let amanhaPrevisao = "";
        if (dailyLen > 1) {
          const code = d.daily.weather_code[1] ?? 0;
          const iconU = dailyIconUrls[1] || "";
          amanhaPrevisao =
            `  <amanha date="${d.daily.time[1]}">\n` +
            `    <temperatura_minima>${Math.round(d.daily.temperature_2m_min[1])}ºC</temperatura_minima>\n` +
            `    <temperatura_maxima>${Math.round(d.daily.temperature_2m_max[1])}ºC</temperatura_maxima>\n` +
            `    <url_imagem_icone>${iconU}</url_imagem_icone>\n` +
            `    <descricao_tempo>${getLabel(code)}</descricao_tempo>\n` +
            `  </amanha>`;
        }

        const previsaoXml =
          `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<previsao>\n` +
          `  <cidade>${name}</cidade>\n` +
          `${dayBlocks[0] ?? ""}\n` +
          `${amanhaPrevisao}\n` +
          `${dayBlocks.slice(1).join("\n")}\n` +
          `</previsao>`;

        const previsaoFile = new Blob([previsaoXml], { type: "application/xml" });
        // Per-user file
        const { error: forecastXmlError } = await supabase.storage
          .from("xml-files")
          .upload(`xml-tempo-${s.user_id}.xml`, previsaoFile, { upsert: true, contentType: "application/xml", cacheControl: "30" });
        if (forecastXmlError) throw forecastXmlError;
        // Compatibilidade com o UUID antigo da Positiva ainda usado em URLs do vMix.
        if (s.user_id === "452ebd1e-61a0-42dd-bf80-231a3f426c83") {
          await supabase.storage.from("xml-files").upload(
            "xml-tempo-d17e65af-e407-466f-9b60-b55c43399513.xml",
            previsaoFile,
            { upsert: true, contentType: "application/xml", cacheControl: "30" },
          );
        }
        // Não publicar um XML compartilhado: o processamento percorre várias
        // emissoras e um único arquivo global faria a última emissora sobrescrever
        // a previsão das demais. O feed oficial é sempre individual por user_id.

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
