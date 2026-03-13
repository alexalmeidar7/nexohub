import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// AI disabled – return a simple template-based description
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { type, city, temp, tempMin, tempMax, humidity, rainChance, condition, forecast } = body;

    let description: string;

    if (type === "forecast" && forecast) {
      const lines = forecast.map((d: any) =>
        `${d.date}: ${d.temp}°C (${d.tempMin}°-${d.tempMax}°), ${d.condition}`
      ).join(". ");
      description = `Previsão para ${city}: ${lines}.`;
    } else {
      description = `Agora em ${city}: ${temp}°C (mín ${tempMin}°C, máx ${tempMax}°C). Umidade: ${humidity}%. Chance de chuva: ${rainChance}%. Condição: ${condition}.`;
    }

    return new Response(JSON.stringify({ description }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
