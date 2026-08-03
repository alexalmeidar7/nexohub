import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action } = body;

    // Action: geocode - search cities and addresses
    if (action === "geocode") {
      const { query, count } = body;
      if (!query || query.trim().length < 2) {
        return new Response(JSON.stringify({ results: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      
      // We use Nominatim (OpenStreetMap) for better address search instead of Open-Meteo geocoding which is city-focused
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=${count || 5}&addressdetails=1&accept-language=pt-BR`;
      
      const res = await fetch(url, {
        headers: {
          "User-Agent": "LovableVMIX/1.0",
        }
      });
      
      const data = await res.json();
      
      // Transform Nominatim data to match the previous structure
      const results = data.map((item: any) => ({
        name: item.display_name.split(',')[0], // Extract first part as name
        display_name: item.display_name,
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
        admin1: item.address?.state || item.address?.city || "",
        country: item.address?.country || ""
      }));

      return new Response(JSON.stringify({ results }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Action: forecast - get weather data
    if (action === "forecast") {
      let { lat, lon } = body;

      // Fallback público: quando o cliente não tem permissão para ler
      // user_settings (ex.: ouvintes no /player), buscamos as coordenadas
      // da rádio pelo user_id usando a service role.
      if ((lat == null || lon == null) && body.user_id) {
        try {
          const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
          const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
          const res = await fetch(
            `${supabaseUrl}/rest/v1/user_settings?user_id=eq.${body.user_id}&select=weather_lat,weather_lon&limit=1`,
            { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } },
          );
          const rows = await res.json();
          const row = Array.isArray(rows) ? rows[0] : null;
          if (row && row.weather_lat != null && row.weather_lon != null) {
            lat = row.weather_lat;
            lon = row.weather_lon;
          }
        } catch (err) {
          console.error("fetch-weather coords lookup failed:", err);
        }
      }

      if (lat == null || lon == null) {
        return new Response(JSON.stringify({ ok: false, error: "lat/lon required" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const forecastDays = body.forecast_days || 6;
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,apparent_temperature,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,weather_code,relative_humidity_2m_max,wind_speed_10m_max&timezone=auto&forecast_days=${forecastDays}`;
      const res = await fetch(url);
      const data = await res.json();
      return new Response(JSON.stringify({ ok: true, data }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: "Unknown action" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fetch-weather error:", e);
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
