import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function templateFallback(body: any): string {
  const { type, city, temp, tempMin, tempMax, humidity, rainChance, condition, forecast } = body;
  if (type === "forecast" && forecast) {
    const lines = forecast.map((d: any) =>
      `${d.date}: ${d.temp}°C (${d.tempMin}°-${d.tempMax}°), ${d.condition}`
    ).join(". ");
    return `Previsão para ${city}: ${lines}.`;
  }
  return `Agora em ${city}: ${temp}°C (mín ${tempMin}°C, máx ${tempMax}°C). Umidade: ${humidity}%. Chance de chuva: ${rainChance}%. Condição: ${condition}.`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { type, city, temp, tempMin, tempMax, humidity, rainChance, condition, forecast } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ description: templateFallback(body) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let prompt: string;
    if (type === "forecast" && forecast) {
      const lines = forecast.map((d: any) =>
        `${d.date}: ${d.temp}°C (min ${d.tempMin}°, max ${d.tempMax}°), ${d.condition}`
      ).join("\n");
      prompt = `Escreva uma previsão do tempo natural e agradável para ${city} com base nos dados:\n${lines}\nUse no máximo 3 frases.`;
    } else {
      prompt = `Escreva uma descrição curta e natural do clima agora em ${city}: ${temp}°C (mín ${tempMin}°, máx ${tempMax}°), umidade ${humidity}%, chance de chuva ${rainChance}%, condição: ${condition}. Use no máximo 2 frases.`;
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          { role: "system", content: "Você é um apresentador de previsão do tempo brasileiro. Seja natural e conciso." },
          { role: "user", content: prompt },
        ],
      }),
    });

    if (!response.ok) {
      console.error("AI gateway error:", response.status);
      return new Response(JSON.stringify({ description: templateFallback(body) }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const description = data.choices?.[0]?.message?.content?.trim() || templateFallback(body);

    return new Response(JSON.stringify({ description }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
