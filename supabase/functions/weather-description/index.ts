import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { type, city, temp, tempMin, tempMax, humidity, rainChance, condition, forecast } = body;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    let systemPrompt: string;
    let userPrompt: string;

    if (type === "forecast" && forecast) {
      systemPrompt = "Você é um apresentador de previsão do tempo de uma rádio brasileira. Use tom jornalístico porém amigável e acessível. Comece o texto sempre com o formato: 'Do dia [primeiro dia] até [último dia], o tempo vai estar assim:' e então descreva as tendências dos 5 dias em um parágrafo fluido (máximo 80 palavras). Destaque tendências (esquenta, esfria, chuva chegando, tempo firme). Inclua dicas práticas quando relevante. Use os nomes dos dias da semana em português. Responda apenas com o texto, sem formatação markdown.";
      const forecastLines = forecast.map((d: any) =>
        `${d.date}: ${d.temp}°C (${d.tempMin}°-${d.tempMax}°), umidade ${d.humidity}%, chuva ${d.rainChance}%, ${d.condition}`
      ).join(". ");
      userPrompt = `Cidade: ${city}. Previsão: ${forecastLines}.`;
    } else {
      systemPrompt = "Você é um apresentador de previsão do tempo de uma rádio brasileira. Use tom jornalístico porém amigável. Gere uma descrição curta e natural do clima atual em no máximo 2 frases (máximo 30 palavras). Dê uma dica prática. Responda apenas com o texto, sem formatação.";
      userPrompt = `Cidade: ${city}. Temperatura: ${temp}°C (mín ${tempMin}°C, máx ${tempMax}°C). Umidade: ${humidity}%. Chance de chuva: ${rainChance}%. Condição: ${condition}.`;
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
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded" }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required" }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      return new Response(JSON.stringify({ error: "AI gateway error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    return new Response(JSON.stringify({ description: text.trim() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("weather-description error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
